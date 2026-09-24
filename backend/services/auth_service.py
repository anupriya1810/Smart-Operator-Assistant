"""
OAuth 2.0 / JWT Authentication & Role-Based Access Control (RBAC) Service
Provides cryptographic RFC 7519 HMAC-SHA256 tokens and user directory management.
"""

import hmac
import hashlib
import base64
import json
import time
from typing import Optional, Dict, Any, List

JWT_SECRET = "CAT_COPILOT_SECURE_HMAC_KEY_2026_SUPERVISOR_OPERATOR"
JWT_ALGORITHM = "HS256"
DEFAULT_EXPIRATION_SEC = 86400  # 24 hours

# Standard base64url helpers without trailing padding '='
def _b64url_encode(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).decode("utf-8").rstrip("=")

def _b64url_decode(s: str) -> bytes:
    padding = 4 - (len(s) % 4)
    if padding != 4:
        s += "=" * padding
    return base64.urlsafe_b64decode(s)

# Known demo accounts for immediate showcase validation
USERS_DATABASE: Dict[str, Dict[str, Any]] = {
    "sarah.jenkins": {
        "user_id": "SUP001",
        "username": "sarah.jenkins",
        "password_hash": hashlib.sha256("cat2026".encode("utf-8")).hexdigest(),
        "name": "Sarah Jenkins",
        "email": "sarah.jenkins@catcopilot.com",
        "role": "supervisor",
        "permissions": [
            "manage_tasks", "view_fleet", "update_thresholds",
            "order_evacuation", "recalibrate_ml", "assign_training", "view_anomalies"
        ],
        "assigned_machine_id": None,
        "preferred_language": "en",
        "timezone": "America/New_York"
    },
    "james.vance": {
        "user_id": "OP1001",
        "username": "james.vance",
        "password_hash": hashlib.sha256("cat2026".encode("utf-8")).hexdigest(),
        "name": "James Vance",
        "email": "james.vance@catcopilot.com",
        "role": "operator",
        "permissions": [
            "view_tasks", "update_task_status", "trigger_sos",
            "log_voice", "view_duty_cycle", "view_fatigue"
        ],
        "assigned_machine_id": "EXC001",
        "preferred_language": "en",
        "timezone": "America/New_York"
    },
    "carlos.gomez": {
        "user_id": "OP1003",
        "username": "carlos.gomez",
        "password_hash": hashlib.sha256("cat2026".encode("utf-8")).hexdigest(),
        "name": "Carlos Gomez",
        "email": "carlos.gomez@catcopilot.com",
        "role": "operator",
        "permissions": [
            "view_tasks", "update_task_status", "trigger_sos",
            "log_voice", "view_duty_cycle", "view_fatigue"
        ],
        "assigned_machine_id": "BLD001",
        "preferred_language": "es",
        "timezone": "America/New_York"
    }
}

class AuthService:
    def __init__(self, secret: str = JWT_SECRET):
        self.secret = secret.encode("utf-8")

    def create_jwt_token(self, payload: Dict[str, Any], expires_in_sec: int = DEFAULT_EXPIRATION_SEC) -> str:
        """Encodes an RFC 7519 HMAC-SHA256 JWT."""
        header = {"alg": "HS256", "typ": "JWT"}
        now = int(time.time())
        token_payload = {
            **payload,
            "iat": now,
            "exp": now + expires_in_sec
        }

        header_b64 = _b64url_encode(json.dumps(header, separators=(",", ":")).encode("utf-8"))
        payload_b64 = _b64url_encode(json.dumps(token_payload, separators=(",", ":")).encode("utf-8"))
        signature_base = f"{header_b64}.{payload_b64}".encode("utf-8")

        sig = hmac.new(self.secret, signature_base, hashlib.sha256).digest()
        sig_b64 = _b64url_encode(sig)

        return f"{header_b64}.{payload_b64}.{sig_b64}"

    def decode_jwt_token(self, token: str) -> Optional[Dict[str, Any]]:
        """Verifies HMAC signature and claims, returning payload or None if invalid/expired."""
        parts = token.strip().split(".")
        if len(parts) != 3:
            return None

        header_b64, payload_b64, sig_b64 = parts
        signature_base = f"{header_b64}.{payload_b64}".encode("utf-8")
        expected_sig = hmac.new(self.secret, signature_base, hashlib.sha256).digest()

        try:
            actual_sig = _b64url_decode(sig_b64)
            if not hmac.compare_digest(expected_sig, actual_sig):
                return None

            payload_raw = _b64url_decode(payload_b64).decode("utf-8")
            payload = json.loads(payload_raw)

            # Check expiration
            if payload.get("exp") and payload["exp"] < int(time.time()):
                return None

            return payload
        except Exception:
            return None

    def authenticate_user(self, username: str, password: str) -> Optional[Dict[str, Any]]:
        """Validates credentials against user directory."""
        user = USERS_DATABASE.get(username.strip().lower())
        if not user:
            # Check by user_id
            user = next((u for u in USERS_DATABASE.values() if u["user_id"].lower() == username.strip().lower()), None)
            if not user:
                return None

        input_hash = hashlib.sha256(password.encode("utf-8")).hexdigest()
        if not hmac.compare_digest(user["password_hash"], input_hash):
            return None

        return user

    def issue_token_for_user(self, user: Dict[str, Any]) -> Dict[str, Any]:
        """Generates access token response with claims."""
        claims = {
            "sub": user["username"],
            "user_id": user["user_id"],
            "role": user["role"],
            "name": user["name"],
            "permissions": user["permissions"]
        }
        token = self.create_jwt_token(claims)
        return {
            "access_token": token,
            "token_type": "bearer",
            "role": user["role"],
            "user_id": user["user_id"],
            "name": user["name"],
            "permissions": user["permissions"],
            "expires_in_sec": DEFAULT_EXPIRATION_SEC
        }

    def get_quick_token(self, role: str) -> Dict[str, Any]:
        """Issues immediate demo token for 1-tap evaluation switcher."""
        if role.lower() == "supervisor":
            return self.issue_token_for_user(USERS_DATABASE["sarah.jenkins"])
        else:
            return self.issue_token_for_user(USERS_DATABASE["james.vance"])

    def get_user_profile(self, user_id: str) -> Optional[Dict[str, Any]]:
        """Retrieves profile details by user_id."""
        user = next((u for u in USERS_DATABASE.values() if u["user_id"] == user_id), None)
        if not user:
            # Fallback to James
            return USERS_DATABASE["james.vance"]
        return user

auth_service = AuthService()
