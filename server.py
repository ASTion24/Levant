import base64
import io
import json
import logging
import re
import sys
import webbrowser
from logging.handlers import RotatingFileHandler
from pathlib import Path
from typing import Any, Dict, List, Optional

import requests
import uvicorn
from docx import Document
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse, Response
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from pypdf import PdfReader

# --- 0. 目录与日志设置 ---
APP_VERSION = "1.21"


def get_runtime_root() -> Path:
    if getattr(sys, "frozen", False):
        return Path(sys.executable).resolve().parent
    return Path(__file__).resolve().parent


ROOT_DIR = get_runtime_root()
WWW_DIR = ROOT_DIR / "www"
SAVES_DIR = ROOT_DIR / "saves"
LEGACY_SAVE_PATH = ROOT_DIR / "savegame.json"
LOGS_DIR = ROOT_DIR / "logs"
SOUNDS_DIR = WWW_DIR / "sounds"
VENDOR_DIR = WWW_DIR / "vendor"
JS_DIR = WWW_DIR / "js"
REQUEST_TIMEOUT = 120

for directory in [SAVES_DIR, LOGS_DIR, SOUNDS_DIR]:
    directory.mkdir(parents=True, exist_ok=True)

# 配置日志：同时输出到控制台和文件
log_file_path = LOGS_DIR / "system.log"
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[
        RotatingFileHandler(str(log_file_path), maxBytes=5*1024*1024, backupCount=3, encoding='utf-8'),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger("Levant")

app = FastAPI(title=f"Levant Engine Backend v{APP_VERSION}")

# --- 挂载静态资源 ---
if VENDOR_DIR.exists():
    app.mount("/vendor", StaticFiles(directory=str(VENDOR_DIR)), name="vendor")
if JS_DIR.exists():
    app.mount("/js", StaticFiles(directory=str(JS_DIR)), name="js")
app.mount("/sounds", StaticFiles(directory=str(SOUNDS_DIR)), name="sounds")


# --- 全局异常捕获中间件 (记录所有未捕获的错误) ---
@app.middleware("http")
async def log_exceptions(request: Request, call_next):
    try:
        return await call_next(request)
    except Exception as e:
        logger.error(f"Unhandled Exception on {request.url.path}: {str(e)}", exc_info=True)
        return JSONResponse(status_code=500, content={"detail": "Internal Server Error. Check logs."})

# --- 2. CORS 设置 ---
app.add_middleware(
    CORSMiddleware,
    allow_origins=["capacitor://localhost"],
    allow_origin_regex=r"^https?://(localhost|127\.0\.0\.1)(:\d+)?$",
    allow_credentials=False,
    allow_methods=["GET", "POST", "DELETE"],
    allow_headers=["Content-Type"],
)

# --- 数据模型 (全员防爆版) ---

class GlobalVar(BaseModel):
    key: str = "Unknown" 
    value: Any = ""      # 允许任意类型
    # [新增] 属性增强：保存类型、可见性、公式
    type: str = "string"        # "string" | "number"
    visibility: str = "editable" # "editable" | "readonly" | "hidden"
    formula: str = ""           # 自动计算公式

class StatSchema(BaseModel):
    key: str = "unknown"
    label: str = "未知属性"
    # [新增] 属性增强：保存类型、可见性、公式
    type: str = "string"        # "string" | "number"
    visibility: str = "editable" # "editable" | "readonly" | "hidden"
    formula: str = ""           # 自动计算公式

class RuleSet(BaseModel):
    id: str
    name: str = "Unnamed Rule Set" # 增加默认值
    fields: List[StatSchema] = []  # ★★★ 关键修复：增加默认空列表，防止新建空规则集时被后端丢弃

class LoreEntry(BaseModel):
    keys: str = "Unknown" # 以前是必填，现在给默认值
    content: str = ""
    mode: str = "auto"
    # 如果 AI 生成了 title，Pydantic 默认会忽略多余字段，但 keys 必须有值
    # 前端会负责把 title 塞进 keys 里，这里兜底防止报错

# [修改] 立绘差分数据模型
class AvatarVariant(BaseModel):
    id: str
    tag: str
    url: str
    # [新增] 视觉调整参数
    scale: float = 1.0
    offsetY: float = 0.0

class Faction(BaseModel):
    id: str = "unknown_id"
    parentId: str = ""
    name: str = "Unknown Faction"
    logo: str = "fa-solid fa-users"
    isProtagonist: bool = False 
    
    # [兼容旧存档] 默认立绘
    avatar: str = "" 
    # [新增] 默认立绘的视觉调整参数
    avatarScale: float = 1.0
    avatarOffsetY: float = 0.0
    
    # [新增] 立绘差分列表
    avatars: List[AvatarVariant] = []

    color: str = "#000000"
    desc: str = ""
    
    # ★★★ [关键修复] 必须显式定义 schemaId，否则会被后端丢弃！ ★★★
    schemaId: str = "default" 
    
    # 属性键值对
    stats: Dict[str, Any] = {}

class MapPin(BaseModel):
    id: str
    x: float
    y: float
    type: str = "custom"
    label: str = "Marker"   # 给默认值防止报错
    linkId: str = ""
    icon: str = "" 
    color: str = ""

class MapRegion(BaseModel):
    id: str
    # 几何信息
    x: float 
    y: float
    w: float
    h: float
    centerX: float
    centerY: float
    maskData: str 
    
    # 逻辑信息
    type: str = "territory"
    name: str = "New Region"
    ownerId: str = ""
    
    # ★★★ [新增] 属性规则支持，确保地块属性被保存 ★★★
    schemaId: str = ""          # 绑定的规则集 ID
    stats: Dict[str, Any] = {}  # 具体的属性数值
    
    # 视觉
    icon: str = ""
    color: str = ""

# [新增] 图层数据模型
class MapLayer(BaseModel):
    id: str
    type: str  # "image", "region", "marker"
    name: str
    visible: bool = True
    opacity: float = 1.0
    data: Any = None # Image层是字符串，Region/Marker层是列表

# [修改] 地图总数据
class MapData(BaseModel):
    # 新的核心数据结构
    layers: List[MapLayer] = []
    activeLayerId: str = ""

    # --- 旧字段 (保留以兼容读取旧存档) ---
    image: str = "" 
    pins: List[MapPin] = []
    regions: List[MapRegion] = []

class EventImpact(BaseModel):
    type: str = "STAT_CHANGE"  # [新增] 关键字段：保存事件类型
    targetId: str = "?"
    targetName: str = "?"
    attrKey: str = "?"
    attrLabel: str = "?"
    oldValue: Any = "?"
    newValue: Any = "?"
    data: Dict[str, Any] = {}  # [新增] 用于存储 ENTITY_CREATE 等复杂数据

class TimelineEvent(BaseModel):
    factionId: str = "global"
    factionIds: List[str] = []
    # [新增] 该事件指定的立绘标签 (例如 "angry")，为空则使用默认
    avatarTag: str = "" 
    timeStart: str = "?"
    timeEnd: str = "?"
    summary: str = "New Event"
    content: str = ""
    impacts: List[EventImpact] = []
    isOpen: bool = False
    options: List[Any] = []
    reasoningSummary: str = ""
    worldObservations: List[str] = []
    futureIntentions: List[str] = []
    decisionMeta: Dict[str, Any] = {}

class Turn(BaseModel):
    id: int
    timeRange: str = "New Turn"
    events: List[TimelineEvent] = []

class GameState(BaseModel):
    global_vars: List[GlobalVar] = []
    
    # ★★★ 确保这里定义正确
    rule_sets: List[RuleSet] = [] 
    
    # 兼容性字段，给个默认值防止报错
    stat_schema: List[StatSchema] = [] 

    lorebook: List[LoreEntry] = []
    players: List[Faction] = []
    map_data: MapData = MapData()
    timeline: List[Turn] = []
    currentTurnPending: List[TimelineEvent] = []
    
# 修改 AIRequest 模型，确保 baseUrl 可选
class AIRequest(BaseModel):
    provider: str
    apiKey: str
    baseUrl: str = ""
    model: str
    systemPrompt: str
    context: str
    history: str = ""
    userPrompt: str
    responseFormat: str = ""
    useProxy: bool = False
    proxyPort: str = "7890"
    capabilities: Dict[str, bool] = {}
    # 新增: 附件列表，格式为 [{"type": "image/png", "data": "base64..."}, {"type": "text/plain", "data": "文本内容..."}]
    attachments: List[Dict[str, str]] = [] 


class ModelListRequest(BaseModel):
    provider: str
    apiKey: str
    baseUrl: str = ""
    useProxy: bool = False
    proxyPort: str = "7890"


def validate_save_filename(filename: str) -> str:
    candidate = (filename or "").strip()
    if not candidate:
        raise HTTPException(status_code=400, detail="Filename is required.")
    if Path(candidate).name != candidate:
        raise HTTPException(status_code=400, detail="Invalid filename.")
    if not candidate.lower().endswith(".json"):
        raise HTTPException(status_code=400, detail="Only .json save files are supported.")
    return candidate


def resolve_save_path(filename: str, *, allow_legacy_root: bool = False) -> Path:
    safe_name = validate_save_filename(filename)
    target = (SAVES_DIR / safe_name).resolve()
    if target.parent != SAVES_DIR.resolve():
        raise HTTPException(status_code=400, detail="Invalid filename.")
    if allow_legacy_root and safe_name == "savegame.json" and not target.exists() and LEGACY_SAVE_PATH.exists():
        return LEGACY_SAVE_PATH
    return target


def build_proxy_url(req: Any) -> Optional[str]:
    if req.useProxy and req.proxyPort:
        return f"http://127.0.0.1:{req.proxyPort}"
    return None


def build_request_options(req: Any) -> Dict[str, Any]:
    options: Dict[str, Any] = {"timeout": REQUEST_TIMEOUT}
    proxy_url = build_proxy_url(req)
    if proxy_url:
        options["proxies"] = {"http": proxy_url, "https": proxy_url}
    return options


def normalize_openai_chat_url(base_url: str) -> str:
    base = normalize_openai_base_url(base_url)
    if not base.endswith("/chat/completions"):
        base = f"{base}/chat/completions"
    return base


def normalize_openai_base_url(base_url: str) -> str:
    base = (base_url.strip() or "https://api.openai.com/v1").rstrip("/")
    for suffix in ("/chat/completions", "/responses", "/models"):
        if base.endswith(suffix):
            base = base[:-len(suffix)]
            break
    return base.rstrip("/")


def build_openai_headers(api_key: str, include_json: bool = False) -> Dict[str, str]:
    headers: Dict[str, str] = {}
    if api_key.strip():
        headers["Authorization"] = f"Bearer {api_key.strip()}"
    if include_json:
        headers["Content-Type"] = "application/json"
    return headers


def extract_openai_message_text(content: Any) -> str:
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        parts = []
        for item in content:
            if isinstance(item, dict) and item.get("type") == "text" and item.get("text"):
                parts.append(item["text"])
        return "\n".join(parts)
    return ""


def call_gemini_api(req: AIRequest, prompt_full: str, media_parts: List[Dict[str, str]]) -> str:
    parts: List[Dict[str, Any]] = [{"text": prompt_full}]
    for media in media_parts:
        parts.append({
            "inline_data": {
                "mime_type": media["mime_type"],
                "data": media["data"],
            }
        })

    request_body: Dict[str, Any] = {"contents": [{"parts": parts}]}
    if req.responseFormat == "json" and req.capabilities.get("structuredOutput"):
        request_body["generationConfig"] = {"responseMimeType": "application/json"}

    response = requests.post(
        f"https://generativelanguage.googleapis.com/v1beta/models/{req.model or 'gemini-3.7-flash'}:generateContent?key={req.apiKey}",
        json=request_body,
        **build_request_options(req),
    )
    response.raise_for_status()
    payload = response.json()

    text_parts: List[str] = []
    for candidate in payload.get("candidates", []):
        for part in candidate.get("content", {}).get("parts", []):
            if part.get("text"):
                text_parts.append(part["text"])

    if text_parts:
        return "\n".join(text_parts)

    block_reason = payload.get("promptFeedback", {}).get("blockReason")
    if block_reason:
        raise HTTPException(status_code=502, detail=f"Gemini blocked the request: {block_reason}")
    raise HTTPException(status_code=502, detail="Gemini returned an empty response.")


def call_claude_api(req: AIRequest, final_text: str, media_parts: List[Dict[str, str]]) -> str:
    content_blocks: List[Dict[str, Any]] = []
    for media in media_parts:
        mime = media["mime_type"]
        if mime not in ["image/jpeg", "image/png", "image/gif", "image/webp"]:
            mime = "image/jpeg"
        content_blocks.append({
            "type": "image",
            "source": {"type": "base64", "media_type": mime, "data": media["data"]},
        })
    content_blocks.append({"type": "text", "text": final_text})

    response = requests.post(
        "https://api.anthropic.com/v1/messages",
        headers={
            "x-api-key": req.apiKey,
            "anthropic-version": "2023-06-01",
            "content-type": "application/json",
        },
        json={
            "model": req.model or "claude-sonnet-4-6",
            "max_tokens": 4096,
            "system": req.systemPrompt,
            "messages": [{"role": "user", "content": content_blocks}],
        },
        **build_request_options(req),
    )
    response.raise_for_status()
    payload = response.json()

    text_parts = [item.get("text", "") for item in payload.get("content", []) if item.get("type") == "text"]
    result = "\n".join(part for part in text_parts if part).strip()
    if result:
        return result
    raise HTTPException(status_code=502, detail="Claude returned an empty response.")


def call_openai_compatible_api(req: AIRequest, final_text: str, media_parts: List[Dict[str, str]]) -> str:
    messages: List[Dict[str, Any]] = [{"role": "system", "content": req.systemPrompt}]

    if media_parts:
        user_content: List[Dict[str, Any]] = [{"type": "text", "text": final_text}]
        for media in media_parts:
            user_content.append({
                "type": "image_url",
                "image_url": {"url": f"data:{media['mime_type']};base64,{media['data']}"},
            })
        messages.append({"role": "user", "content": user_content})
    else:
        messages.append({"role": "user", "content": final_text})

    request_body: Dict[str, Any] = {
        "model": req.model,
        "messages": messages,
    }
    if req.responseFormat == "json" and req.capabilities.get("structuredOutput"):
        request_body["response_format"] = {"type": "json_object"}

    response = requests.post(
        normalize_openai_chat_url(req.baseUrl),
        headers=build_openai_headers(req.apiKey, include_json=True),
        json=request_body,
        **build_request_options(req),
    )
    response.raise_for_status()
    payload = response.json()

    choices = payload.get("choices", [])
    if not choices:
        raise HTTPException(status_code=502, detail="OpenAI-compatible provider returned no choices.")

    result = extract_openai_message_text(choices[0].get("message", {}).get("content"))
    if result:
        return result
    raise HTTPException(status_code=502, detail="OpenAI-compatible provider returned an empty response.")

# --- API 路由 ---

@app.get("/api/saves")
def get_saves_list():
    try:
        files = sorted(path.name for path in SAVES_DIR.iterdir() if path.is_file() and path.suffix.lower() == ".json")
        logger.info(f"Loaded save list: {len(files)} files found.")
        return {"files": files}
    except Exception as e:
        logger.error(f"Error fetching save list: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/state", response_model=GameState)
def get_state(filename: str):
    filepath = resolve_save_path(filename, allow_legacy_root=True)
    
    if not filepath.exists():
        logger.warning(f"Save file not found: {filename}")
        raise HTTPException(status_code=404, detail=f"Save file not found: {filename}")
    
    try:
        with filepath.open("r", encoding="utf-8") as f:
            data = json.load(f)
            
            # --- 【强力兼容补丁】 ---
            
            # 1. 如果存档里有 stat_schema 但没有 rule_sets (旧存档升级)
            if "rule_sets" not in data:
                # 尝试找旧的字段
                old_schema = data.get("stat_schema", data.get("schema", []))
                
                # 如果旧字段也没有，那就给个空的默认值
                if not old_schema:
                    old_schema = []
                    
                # 构造默认规则集
                data["rule_sets"] = [{
                    "id": "default",
                    "name": "通用实体 (Default)",
                    "fields": old_schema
                }]
                
                # 给所有实体打上默认标签
                for player in data.get("players", []):
                    if "schemaId" not in player:
                        player["schemaId"] = "default"
            
            # 2. 如果存档里有 schemaId 字段丢失的情况 (针对你刚才遇到的 bug)
            # 强制检查所有 rule_sets 的 ID，如果没有匹配的，就回落到第一个规则集
            if data.get("rule_sets"):
                valid_ids = [r["id"] for r in data["rule_sets"]]
                fallback_id = valid_ids[0] if valid_ids else "default"
                
                for player in data.get("players", []):
                    if "schemaId" not in player or player["schemaId"] not in valid_ids:
                        player["schemaId"] = fallback_id

            logger.info(f"Game state loaded: {filename}")
            return data
    except Exception as e:
        logger.error(f"Error reading save file {filename}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Error reading save file: {str(e)}")

@app.post("/api/state")
def save_state(filename: str, state: GameState):
    filepath = resolve_save_path(filename)
    try:
        with filepath.open("w", encoding="utf-8") as f:
            f.write(state.model_dump_json(indent=2))
        logger.info(f"Game state saved: {filename}")
        return {"status": "saved", "filename": filename}
    except Exception as e:
        logger.error(f"Error saving file {filename}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Error saving file: {str(e)}")

@app.delete("/api/saves/{filename}")
def delete_save(filename: str):
    filepath = resolve_save_path(filename)
    if filepath.exists():
        try:
            filepath.unlink()
            logger.info(f"Deleted save file: {filename}")
            return {"status": "deleted", "filename": filename}
        except Exception as e:
            logger.error(f"Error deleting file {filename}: {e}")
            raise HTTPException(status_code=500, detail=f"Error deleting file: {str(e)}")
    else:
        raise HTTPException(status_code=404, detail="File not found")

# ★★★ [新增] 获取背景音乐列表接口 ★★★
@app.get("/api/music-list")
def get_music_list():
    folder = SOUNDS_DIR
    if not folder.exists():
        print(f"!!! [Backend] Folder '{folder}' not found!")
        return {"files": []}
    
    music_files = sorted(
        path.name for path in folder.iterdir()
        if path.is_file() and path.suffix.lower() in {'.mp3', '.wav', '.ogg', '.flac'}
    )
    
    # ★★★ [新增] 打印日志到后台黑框 ★★★
    print(f"--- [Music Scan] Found {len(music_files)} files: {music_files}")
    
    return {"files": music_files}

# [优化] 智能日志清洗函数
def smart_clean_payload(obj):
    """
    智能清洗日志：
    1. 保留长的文本 Context/Prompt (对调试很重要)。
    2. 仅过滤 API Key 和 疑似 Base64 的二进制数据字段。
    """
    if isinstance(obj, dict):
        new_obj = {}
        for k, v in obj.items():
            # 1. 敏感字段脱敏
            if k == 'apiKey':
                new_obj[k] = f"***{v[-4:]}" if v and isinstance(v, str) else "None"
            
            # 2. 靶向过滤：已知的二进制/Base64 字段名
            # 'data': 通常在 attachments 里
            # 'image', 'maskData': 地图数据
            # 'logo': 实体图标可能是 Base64
            elif k in ['data', 'image', 'maskData', 'logo', 'base64'] and isinstance(v, str):
                # 只有长度超过 200 才认为是 Base64，防止误伤短的 URL 或 FontAwesome class
                if len(v) > 200:
                    new_obj[k] = f"<BASE64_DATA_OMITTED size={len(v)}>"
                else:
                    new_obj[k] = v
            
            # 3. 递归处理
            else:
                new_obj[k] = smart_clean_payload(v)
        return new_obj
    
    elif isinstance(obj, list):
        return [smart_clean_payload(i) for i in obj]
    
    return obj

# --- 核心：智能附件处理器 (ETL) ---
def process_attachments_smart(attachments, allow_native_doc=False, allow_image=False):
    text_to_append = ""
    media_parts = []

    for att in attachments:
        name = att.get('name', 'unknown')
        mime_type = att.get('type', '')
        data_b64 = att.get('data', '')

        # 1. 再次清洗 (防止前端没切干净)
        data_b64 = re.sub(r'^data:.*?;base64,', '', data_b64).strip()

        # [调试日志] 打印前20个字符，检查是否看起来像正常的 Base64
        # PDF 通常以 JVBERi 开头; ZIP(Docx) 通常以 UEsDB 开头
        if len(data_b64) > 20:
             logger.info(f"Processing {name}, header snippet: {data_b64[:20]}...")

        try:
            # === 1. 图片处理 ===
            if "image" in mime_type:
                if allow_image:
                    media_parts.append({"type": "image", "mime_type": mime_type, "data": data_b64})
                else:
                    text_to_append += f"\n[System: User uploaded image '{name}', but current model does not support vision. Image discarded.]\n"
                continue

            # === 2. PDF / Word / 文本处理 ===
            if allow_native_doc and ("pdf" in mime_type):
                 media_parts.append({"type": "document", "mime_type": mime_type, "data": data_b64})
                 continue

            # 解码
            try:
                # 兼容性解码
                file_bytes = base64.b64decode(data_b64.encode('utf-8'), validate=False)
            except Exception as b64_err:
                logger.error(f"Base64 Decode Error for {name}: {b64_err}")
                text_to_append += f"\n[System: File '{name}' corrupted during upload.]\n"
                continue

            file_stream = io.BytesIO(file_bytes)
            extracted_content = ""
            header = ""
            
            # --- PDF ---
            if "pdf" in mime_type or name.lower().endswith(".pdf"):
                try:
                    reader = PdfReader(file_stream)
                    if reader.is_encrypted:
                        try: reader.decrypt("")
                        except: pass
                    
                    # 检查文件头签名
                    file_stream.seek(0)
                    sig = file_stream.read(4)
                    if sig != b'%PDF':
                        logger.warning(f"File {name} does not look like a PDF. Signature: {sig}")

                    file_stream.seek(0)
                    pages_text = []
                    for page in reader.pages:
                        t = page.extract_text()
                        if t: pages_text.append(t)
                    extracted_content = "\n".join(pages_text) if pages_text else "[PDF contains no text]"
                    header = f"=== PDF CONTENT: {name} ==="
                except Exception as e:
                    logger.warning(f"PDF Error {name}: {e}")
                    header = f"=== PDF ERROR: {name} ==="
                    extracted_content = "[Unreadable PDF]"

            # --- Word ---
            elif "word" in mime_type or "document" in mime_type or name.lower().endswith(".docx"):
                try:
                    doc = Document(file_stream)
                    extracted_content = "\n".join([p.text for p in doc.paragraphs])
                    header = f"=== WORD CONTENT: {name} ==="
                except Exception as e:
                     logger.warning(f"DOCX Error {name}: {e}")
                     header = f"=== WORD ERROR: {name} ==="
                     extracted_content = "[Unreadable DOCX]"
            
            # --- Text ---
            else:
                try:
                    extracted_content = file_bytes.decode('utf-8')
                    header = f"=== TEXT FILE: {name} ==="
                except:
                    try:
                        extracted_content = file_bytes.decode('gbk')
                        header = f"=== TEXT FILE: {name} ==="
                    except:
                        header = f"=== BINARY FILE IGNORED: {name} ==="

            if extracted_content:
                if len(extracted_content) > 50000:
                     extracted_content = extracted_content[:50000] + "\n...[Truncated]"
                text_to_append += f"\n\n{header}\n{extracted_content}\n"
            
        except Exception as e:
            logger.error(f"Processing failed for {name}: {e}")
            text_to_append += f"\n[System: Error processing {name}]\n"

    return text_to_append, media_parts


def list_provider_models(req: ModelListRequest) -> List[Dict[str, str]]:
    provider = req.provider.lower()
    request_options = build_request_options(req)

    if provider == "gemini":
        response = requests.get(
            "https://generativelanguage.googleapis.com/v1beta/models",
            params={"key": req.apiKey, "pageSize": 1000},
            **request_options,
        )
        response.raise_for_status()
        models = []
        for item in response.json().get("models", []):
            methods = item.get("supportedGenerationMethods", [])
            if "generateContent" not in methods:
                continue
            model_id = item.get("name", "").removeprefix("models/")
            if model_id:
                models.append({
                    "id": model_id,
                    "displayName": item.get("displayName") or model_id,
                })
        return models

    if provider == "claude":
        response = requests.get(
            "https://api.anthropic.com/v1/models",
            headers={
                "x-api-key": req.apiKey,
                "anthropic-version": "2023-06-01",
            },
            params={"limit": 1000},
            **request_options,
        )
        response.raise_for_status()
        return [
            {
                "id": item["id"],
                "displayName": item.get("display_name") or item["id"],
            }
            for item in response.json().get("data", [])
            if item.get("id")
        ]

    response = requests.get(
        f"{normalize_openai_base_url(req.baseUrl)}/models",
        headers=build_openai_headers(req.apiKey),
        **request_options,
    )
    response.raise_for_status()
    return [
        {
            "id": item["id"],
            "displayName": item.get("display_name") or item.get("name") or item["id"],
        }
        for item in response.json().get("data", [])
        if item.get("id")
    ]


@app.post("/api/ai/models")
def get_ai_models(req: ModelListRequest):
    if req.provider.lower() in {"gemini", "claude"} and not req.apiKey:
        raise HTTPException(status_code=400, detail="Missing API Key")
    try:
        return {"models": list_provider_models(req), "source": "provider"}
    except requests.RequestException as error:
        logger.warning("Model discovery failed for provider %s: %s", req.provider, error)
        raise HTTPException(status_code=502, detail=f"Model Discovery Failed: {error}")


@app.post("/api/ai/generate")
def ai_generate(req: AIRequest):
    # 1. 日志记录
    raw_dump = req.model_dump()
    safe_log_req = smart_clean_payload(raw_dump)
    logger.info(f"AI Request Received. Payload:\n{json.dumps(safe_log_req, indent=2, ensure_ascii=False)}")

    try:
        provider = req.provider.lower()
        can_see_image = req.capabilities.get("vision", provider in {"gemini", "claude"})
        can_read_native_documents = req.capabilities.get("nativeDocuments", provider == "gemini")
        
        # === A. Gemini (原生支持 PDF 和 图片) ===
        if provider == "gemini":
            if not req.apiKey:
                raise HTTPException(status_code=400, detail="Missing API Key")
            
            # 允许 Native Doc (PDF) 和 Image
            text_part, media_parts = process_attachments_smart(
                req.attachments,
                allow_native_doc=can_read_native_documents,
                allow_image=can_see_image,
            )
            
            # 拼接文本上下文
            prompt_full = req.systemPrompt + "\n\n=== CONTEXT ===\n" + req.context + text_part + "\n\n=== INSTRUCTION ===\n" + req.userPrompt
            
            result_text = call_gemini_api(req, prompt_full, media_parts)
            logger.info(f"AI Response (Gemini): {result_text}")
            return {"result": result_text}

        # === B. Claude (支持图片，但不支持原生 PDF 文件流，需转文本) ===
        elif provider == "claude":
            if not req.apiKey:
                raise HTTPException(status_code=400, detail="Missing API Key")
            
            # 不允许 Native Doc (转文本)，允许 Image
            text_part, media_parts = process_attachments_smart(
                req.attachments,
                allow_native_doc=False,
                allow_image=can_see_image,
            )
            
            final_text = f"=== CONTEXT ===\n{req.context}\n{text_part}\n=== INSTRUCTION ===\n{req.userPrompt}"
            result_text = call_claude_api(req, final_text, media_parts)
            logger.info(f"AI Response (Claude): {result_text}")
            return {"result": result_text}

        # === C. OpenAI Compatible (DeepSeek, GPT, Qwen, etc) ===
        else:
            # 根据模型能力决定是否允许图片
            # 不允许 Native Doc (OpenAI API 不支持直接传 PDF)，根据 can_see_image 决定是否允许 Image
            text_part, media_parts = process_attachments_smart(req.attachments, allow_native_doc=False, allow_image=can_see_image)

            final_text = f"=== CONTEXT ===\n{req.context}\n{text_part}\n=== INSTRUCTION ===\n{req.userPrompt}"
            result_text = call_openai_compatible_api(req, final_text, media_parts)
            logger.info(f"AI Response (OpenAI/Compatible): {result_text}")
            return {"result": result_text}

    except HTTPException:
        raise
    except requests.RequestException as e:
        logger.error(f"AI provider request failed: {str(e)}", exc_info=True)
        raise HTTPException(status_code=502, detail=f"AI Provider Request Failed: {str(e)}")
    except Exception as e:
        logger.error(f"AI Generation Failed: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"AI Error: {str(e)}")

# --- 托管网页 ---
@app.get("/")
async def read_index():
    index_path = WWW_DIR / "index.html"
    if not index_path.exists():
        return JSONResponse(status_code=404, content={"error": "www/index.html not found"})
    try:
        with index_path.open("r", encoding="utf-8") as f:
            html_content = f.read()
        return Response(content=html_content, media_type="text/html", headers={"Cache-Control": "no-cache"})
    except Exception as e:
        logger.error(f"Index load error: {e}")
        return JSONResponse(status_code=500, content={"error": str(e)})

@app.get("/logo.png")
async def get_logo():
    logo_path = WWW_DIR / "logo.png"
    if logo_path.exists():
        return FileResponse(str(logo_path))
    return {"error": "Logo not found"}

# ★★★ 新增：允许浏览器加载 api_layer.js ★★★
@app.get("/api_layer.js")
async def get_api_layer():
    script_path = WWW_DIR / "api_layer.js"
    if script_path.exists():
        return FileResponse(str(script_path), headers={"Cache-Control": "no-cache"})
    return Response(status_code=404)


@app.get("/capacitor-filesystem.js")
async def get_capacitor_filesystem():
    script_path = WWW_DIR / "capacitor-filesystem.js"
    if script_path.exists():
        return FileResponse(str(script_path), headers={"Cache-Control": "no-cache"})
    return Response(status_code=404)


# --- [新增] 地图编辑器路由 ---
@app.get("/map_editor")
async def get_map_editor():
    editor_path = WWW_DIR / "map_editor.html"
    if not editor_path.exists():
        return Response(content="<h1>map_editor.html not found</h1>", media_type="text/html")
    with editor_path.open("r", encoding="utf-8") as f:
        return Response(content=f.read(), media_type="text/html")

if __name__ == "__main__":
    webbrowser.open("http://127.0.0.1:8000")
    print("系统启动中... 日志保存在 logs/system.log")
    uvicorn.run(app, host="127.0.0.1", port=8000)
