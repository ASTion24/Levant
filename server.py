import uvicorn
import webbrowser
from fastapi import FastAPI, HTTPException, Body, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse, Response
from pydantic import BaseModel
from typing import List, Dict, Any
import json
from fastapi.staticfiles import StaticFiles
import os
import time
import logging
from logging.handlers import RotatingFileHandler

# --- 新增依赖 ---
import google.generativeai as genai
from openai import OpenAI  # 用于支持 DeepSeek, Qwen, Yi, Local LLM 等
import anthropic # 新增 Claude 支持
import base64
import io
import re  # <--- 新增正则模块，用于精准清洗 Base64
from pypdf import PdfReader  # 用于解析 PDF
from docx import Document    # 用于解析 Word

# --- 0. 目录与日志设置 ---
SAVES_DIR = "saves"
LOGS_DIR = "logs"

for d in [SAVES_DIR, LOGS_DIR]:
    if not os.path.exists(d):
        os.makedirs(d)

# 配置日志：同时输出到控制台和文件
log_file_path = os.path.join(LOGS_DIR, "system.log")
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[
        RotatingFileHandler(log_file_path, maxBytes=5*1024*1024, backupCount=3, encoding='utf-8'),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger("Levant")

app = FastAPI(title="LevantD Engine Backend")

# --- ★★★ [新增] 挂载静态音频目录 ★★★ ---
# 这一步告诉后端：如果有人访问 /sounds/xxx，就去 www/sounds 文件夹找
if not os.path.exists("www/sounds"):
    os.makedirs("www/sounds") # 如果没有文件夹，自动创建一个

# 将 /sounds 路径映射到 www/sounds 文件夹
app.mount("/sounds", StaticFiles(directory="www/sounds"), name="sounds")


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
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
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
    # [新增] 该事件指定的立绘标签 (例如 "angry")，为空则使用默认
    avatarTag: str = "" 
    timeStart: str = "?"
    timeEnd: str = "?"
    summary: str = "New Event"
    content: str = ""
    impacts: List[EventImpact] = []
    isOpen: bool = False
    options: List[Any] = []

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
    useProxy: bool = False
    proxyPort: str = "7890"
    # 新增: 附件列表，格式为 [{"type": "image/png", "data": "base64..."}, {"type": "text/plain", "data": "文本内容..."}]
    attachments: List[Dict[str, str]] = [] 

# --- API 路由 ---

@app.get("/api/saves")
def get_saves_list():
    try:
        files = [f for f in os.listdir(SAVES_DIR) if f.endswith('.json')]
        logger.info(f"Loaded save list: {len(files)} files found.")
        return {"files": sorted(files)}
    except Exception as e:
        logger.error(f"Error fetching save list: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/state", response_model=GameState)
def get_state(filename: str):
    filepath = os.path.join(SAVES_DIR, filename)
    if filename == 'savegame.json' and not os.path.exists(filepath) and os.path.exists("savegame.json"):
        filepath = "savegame.json"
    
    if not os.path.exists(filepath):
        logger.warning(f"Save file not found: {filename}")
        raise HTTPException(status_code=404, detail=f"Save file not found: {filename}")
    
    try:
        with open(filepath, "r", encoding="utf-8") as f:
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
    if ".." in filename or "/" in filename or "\\" in filename:
        raise HTTPException(status_code=400, detail="Invalid filename.")
    
    filepath = os.path.join(SAVES_DIR, filename)
    try:
        with open(filepath, "w", encoding="utf-8") as f:
            f.write(state.model_dump_json(indent=2))
        logger.info(f"Game state saved: {filename}")
        return {"status": "saved", "filename": filename}
    except Exception as e:
        logger.error(f"Error saving file {filename}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Error saving file: {str(e)}")

@app.delete("/api/saves/{filename}")
def delete_save(filename: str):
    if ".." in filename or "/" in filename or "\\" in filename:
        raise HTTPException(status_code=400, detail="Invalid filename.")
    filepath = os.path.join(SAVES_DIR, filename)
    if os.path.exists(filepath):
        try:
            os.remove(filepath)
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
    folder = "www/sounds"  # <--- 修正指向 www
    if not os.path.exists(folder):
        print(f"!!! [Backend] Folder '{folder}' not found!")
        return {"files": []}
    
    # 扫描文件
    music_files = [
        f for f in os.listdir(folder)
        if f.lower().endswith(('.mp3', '.wav', '.ogg', '.flac'))
    ]
    
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

# --- 辅助函数：判断模型是否支持视觉 ---
def is_vision_model(provider: str, model_name: str) -> bool:
    """根据模型名称和提供商，启发式判断是否支持图片输入"""
    model = model_name.lower()
    # 1. 明确支持视觉的系列
    if "gemini" in model: return True
    if "claude" in model: return True
    if "gpt-4" in model and ("vision" in model or "o" in model): return True # gpt-4o, gpt-4-turbo
    if "qwen-vl" in model: return True
    if "llava" in model: return True
    
    # 2. 明确不支持视觉的系列 (DeepSeek V3/R1 目前仅文本)
    if "deepseek" in model: return False 
    
    # 3. 兜底策略：默认视为不支持，防止报错
    return False 

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

@app.post("/api/ai/generate")
def ai_generate(req: AIRequest):
    # 1. 日志记录
    raw_dump = req.model_dump()
    safe_log_req = smart_clean_payload(raw_dump)
    logger.info(f"AI Request Received. Payload:\n{json.dumps(safe_log_req, indent=2, ensure_ascii=False)}")
    
    # 2. 代理设置
    if req.useProxy and req.proxyPort:
        os.environ["HTTP_PROXY"] = f"http://127.0.0.1:{req.proxyPort}"
        os.environ["HTTPS_PROXY"] = f"http://127.0.0.1:{req.proxyPort}"
    else:
        os.environ.pop("HTTP_PROXY", None)
        os.environ.pop("HTTPS_PROXY", None)

    try:
        provider = req.provider.lower()
        model_name = req.model.lower()
        
        # 判断模型能力
        can_see_image = is_vision_model(provider, model_name)
        
        # === A. Gemini (原生支持 PDF 和 图片) ===
        if provider == "gemini":
            if not req.apiKey: raise HTTPException(status_code=400, detail="Missing API Key")
            genai.configure(api_key=req.apiKey)
            model = genai.GenerativeModel(model_name=req.model or "gemini-2.5-flash")
            
            # 允许 Native Doc (PDF) 和 Image
            text_part, media_parts = process_attachments_smart(req.attachments, allow_native_doc=True, allow_image=True)
            
            # 拼接文本上下文
            prompt_full = req.systemPrompt + "\n\n=== CONTEXT ===\n" + req.context + text_part + "\n\n=== INSTRUCTION ===\n" + req.userPrompt
            
            # 构造 Gemini 请求部分
            content_list = [prompt_full]
            for m in media_parts:
                content_list.append({"mime_type": m["mime_type"], "data": m["data"]})
            
            response = model.generate_content(content_list)
            result_text = response.text if response.text else "Blocked."
            logger.info(f"AI Response (Gemini): {result_text}")
            return {"result": result_text}

        # === B. Claude (支持图片，但不支持原生 PDF 文件流，需转文本) ===
        elif provider == "claude":
            if not req.apiKey: raise HTTPException(status_code=400, detail="Missing API Key")
            client = anthropic.Anthropic(api_key=req.apiKey)
            
            # 不允许 Native Doc (转文本)，允许 Image
            text_part, media_parts = process_attachments_smart(req.attachments, allow_native_doc=False, allow_image=True)
            
            final_text = f"=== CONTEXT ===\n{req.context}\n{text_part}\n=== INSTRUCTION ===\n{req.userPrompt}"
            
            content_blocks = []
            # 添加图片
            for m in media_parts:
                mime = m["mime_type"]
                # Claude 严格的 mime 校验
                if mime not in ["image/jpeg", "image/png", "image/gif", "image/webp"]:
                    mime = "image/jpeg"
                content_blocks.append({
                    "type": "image",
                    "source": {"type": "base64", "media_type": mime, "data": m["data"]}
                })
            
            # 添加文本
            content_blocks.append({"type": "text", "text": final_text})

            message = client.messages.create(
                model=req.model or "claude-3-5-sonnet-20240620",
                max_tokens=4096,
                system=req.systemPrompt,
                messages=[{"role": "user", "content": content_blocks}]
            )
            result_text = message.content[0].text
            logger.info(f"AI Response (Claude): {result_text}")
            return {"result": result_text}

        # === C. OpenAI Compatible (DeepSeek, GPT, Qwen, etc) ===
        else:
            if not req.apiKey: raise HTTPException(status_code=400, detail="Missing API Key")
            base_url = req.baseUrl.strip() or "https://api.openai.com/v1"
            client = OpenAI(api_key=req.apiKey, base_url=base_url)
            
            # 根据模型能力决定是否允许图片
            # 不允许 Native Doc (OpenAI API 不支持直接传 PDF)，根据 can_see_image 决定是否允许 Image
            text_part, media_parts = process_attachments_smart(req.attachments, allow_native_doc=False, allow_image=can_see_image)

            final_text = f"=== CONTEXT ===\n{req.context}\n{text_part}\n=== INSTRUCTION ===\n{req.userPrompt}"
            
            messages = [{"role": "system", "content": req.systemPrompt}]
            
            # 如果有媒体文件 (图片)，必须使用 content 数组格式
            if len(media_parts) > 0:
                user_content = [{"type": "text", "text": final_text}]
                for m in media_parts:
                    user_content.append({
                        "type": "image_url",
                        "image_url": {"url": f"data:{m['mime_type']};base64,{m['data']}"}
                    })
                messages.append({"role": "user", "content": user_content})
            else:
                # 只有文本，直接发字符串 (DeepSeek 最兼容的格式)
                messages.append({"role": "user", "content": final_text})

            completion = client.chat.completions.create(
                model=req.model,
                messages=messages,
                temperature=0.7,
            )
            result_text = completion.choices[0].message.content
            logger.info(f"AI Response (OpenAI/Compatible): {result_text}")
            return {"result": result_text}

    except Exception as e:
        logger.error(f"AI Generation Failed: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"AI Error: {str(e)}")

# --- 托管网页 ---
@app.get("/")
async def read_index():
    if not os.path.exists("www/index.html"): # 指向 www
        return JSONResponse(status_code=404, content={"error": "www/index.html not found"})
    try:
        with open("www/index.html", "r", encoding="utf-8") as f: # 指向 www
            html_content = f.read()
        return Response(content=html_content, media_type="text/html", headers={"Cache-Control": "no-cache"})
    except Exception as e:
        logger.error(f"Index load error: {e}")
        return JSONResponse(status_code=500, content={"error": str(e)})

@app.get("/logo.png")
async def get_logo():
    if os.path.exists("www/logo.png"): return FileResponse("www/logo.png")
    return {"error": "Logo not found"}

# ★★★ 新增：允许浏览器加载 api_layer.js ★★★
@app.get("/api_layer.js")
async def get_api_layer():
    if os.path.exists("www/api_layer.js"):  # 指向 www
        return FileResponse("www/api_layer.js", headers={"Cache-Control": "no-cache"}) 
    return Response(status_code=404)


# --- [新增] 地图编辑器路由 ---
@app.get("/map_editor")
async def get_map_editor():
    if not os.path.exists("www/map_editor.html"): 
        return Response(content="<h1>map_editor.html not found</h1>", media_type="text/html")
    with open("www/map_editor.html", "r", encoding="utf-8") as f:
        return Response(content=f.read(), media_type="text/html")

if __name__ == "__main__":
    webbrowser.open("http://127.0.0.1:8000")
    print("系统启动中... 日志保存在 logs/system.log")
    uvicorn.run(app, host="127.0.0.1", port=8000)