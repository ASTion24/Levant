import unittest
from unittest.mock import Mock, patch

from fastapi.testclient import TestClient

from server import (
    AIRequest,
    GameState,
    ModelListRequest,
    app,
    call_openai_compatible_api,
    list_provider_models,
)


class ServerRegressionTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.client = TestClient(app)

    def test_path_traversal_is_rejected(self):
        response = self.client.get("/api/state", params={"filename": "../capacitor.config.json"})
        self.assertEqual(response.status_code, 400)

    def test_vendor_assets_are_served(self):
        for path in [
            "/vendor/js/axios.min.js",
            "/vendor/js/jsep.iife.min.js",
            "/vendor/css/tailwind.css",
            "/js/app.js",
            "/js/formula-engine.js",
            "/js/model-catalog.js",
            "/js/modules/autonomy.js",
            "/js/modules/map.js",
        ]:
            with self.subTest(path=path):
                response = self.client.get(path)
                self.assertEqual(response.status_code, 200)

    def test_cors_only_exposes_local_app_origins(self):
        local_response = self.client.get(
            "/api/saves",
            headers={"Origin": "http://127.0.0.1:8012"},
        )
        self.assertEqual(
            local_response.headers.get("access-control-allow-origin"),
            "http://127.0.0.1:8012",
        )

        remote_response = self.client.get(
            "/api/saves",
            headers={"Origin": "https://attacker.example"},
        )
        self.assertNotIn(
            "access-control-allow-origin",
            remote_response.headers,
        )

        opaque_response = self.client.get(
            "/api/saves",
            headers={"Origin": "null"},
        )
        self.assertNotIn(
            "access-control-allow-origin",
            opaque_response.headers,
        )

    def test_capacitor_filesystem_script_is_served(self):
        response = self.client.get("/capacitor-filesystem.js")
        self.assertEqual(response.status_code, 200)

    def test_default_savegame_still_loads(self):
        response = self.client.get("/api/state", params={"filename": "savegame.json"})
        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertIn("timeline", payload)
        self.assertIn("players", payload)

    def test_autonomous_decision_metadata_round_trips(self):
        state = GameState.model_validate({
            "timeline": [{
                "id": 1,
                "timeRange": "Turn 1",
                "events": [{
                    "factionId": "global",
                    "factionIds": ["global"],
                    "summary": "Autonomous event",
                    "reasoningSummary": "The strategic window was closing.",
                    "worldObservations": ["Border pressure increased."],
                    "futureIntentions": ["Secure the northern route."],
                    "decisionMeta": {
                        "mode": "autonomous",
                        "autoValidated": True,
                        "repairAttempts": 0,
                    },
                }],
            }],
        })
        event = state.model_dump()["timeline"][0]["events"][0]
        self.assertEqual(event["factionIds"], ["global"])
        self.assertEqual(event["decisionMeta"]["mode"], "autonomous")
        self.assertTrue(event["decisionMeta"]["autoValidated"])

    @patch("server.requests.get")
    def test_gemini_model_discovery_filters_non_generation_models(self, mock_get):
        response = Mock()
        response.json.return_value = {
            "models": [
                {
                    "name": "models/gemini-current",
                    "displayName": "Gemini Current",
                    "supportedGenerationMethods": ["generateContent"],
                },
                {
                    "name": "models/text-embedding",
                    "displayName": "Embedding",
                    "supportedGenerationMethods": ["embedContent"],
                },
            ]
        }
        mock_get.return_value = response

        models = list_provider_models(ModelListRequest(provider="Gemini", apiKey="test"))

        self.assertEqual(models, [{"id": "gemini-current", "displayName": "Gemini Current"}])
        response.raise_for_status.assert_called_once()

    @patch("server.requests.get")
    def test_openai_model_discovery_normalizes_base_url(self, mock_get):
        response = Mock()
        response.json.return_value = {"data": [{"id": "future-model"}]}
        mock_get.return_value = response

        models = list_provider_models(ModelListRequest(
            provider="OpenAI",
            apiKey="test",
            baseUrl="https://provider.example/v1/chat/completions",
        ))

        self.assertEqual(models[0]["id"], "future-model")
        self.assertEqual(mock_get.call_args.args[0], "https://provider.example/v1/models")

    @patch("server.requests.get")
    def test_local_model_discovery_allows_empty_api_key(self, mock_get):
        response = Mock()
        response.json.return_value = {"data": [{"id": "local-model"}]}
        mock_get.return_value = response

        result = self.client.post("/api/ai/models", json={
            "provider": "OpenAI",
            "apiKey": "",
            "baseUrl": "http://localhost:11434/v1",
        })

        self.assertEqual(result.status_code, 200)
        self.assertEqual(result.json()["models"][0]["id"], "local-model")
        self.assertEqual(mock_get.call_args.kwargs["headers"], {})

    @patch("server.requests.post")
    def test_json_mode_is_enabled_only_for_capable_models(self, mock_post):
        response = Mock()
        response.json.return_value = {
            "choices": [{"message": {"content": '{"status":"ok"}'}}]
        }
        mock_post.return_value = response
        request = AIRequest(
            provider="OpenAI",
            apiKey="test",
            baseUrl="https://api.openai.com/v1",
            model="future-model",
            systemPrompt="Return JSON.",
            context="",
            userPrompt="Test",
            responseFormat="json",
            capabilities={"structuredOutput": True},
        )

        result = call_openai_compatible_api(request, "Test", [])

        self.assertEqual(result, '{"status":"ok"}')
        self.assertEqual(
            mock_post.call_args.kwargs["json"]["response_format"],
            {"type": "json_object"},
        )

    @patch("server.requests.post")
    def test_local_generation_omits_empty_authorization_header(self, mock_post):
        response = Mock()
        response.json.return_value = {
            "choices": [{"message": {"content": "OK"}}]
        }
        mock_post.return_value = response
        request = AIRequest(
            provider="OpenAI",
            apiKey="",
            baseUrl="http://localhost:11434/v1",
            model="local-model",
            systemPrompt="Test.",
            context="",
            userPrompt="Test",
        )

        result = call_openai_compatible_api(request, "Test", [])

        self.assertEqual(result, "OK")
        self.assertEqual(
            mock_post.call_args.kwargs["headers"],
            {"Content-Type": "application/json"},
        )


if __name__ == "__main__":
    unittest.main()
