from abc import ABC, abstractmethod
from typing import List, Dict, Any, Optional
import json
import logging
from datetime import datetime, timezone

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("NotificationService")

class NotificationChannel(ABC):
    @abstractmethod
    async def send(self, target: str, message: str, payload: Optional[Dict[str, Any]] = None) -> bool:
        """Send notification through specific channel (websocket, sms, email, push)."""
        pass

class WebSocketChannel(NotificationChannel):
    """Broadcasts safety alerts and task updates to active connected in-cab / supervisor clients."""
    def __init__(self):
        self.active_connections: List[Any] = []

    def connect(self, websocket: Any):
        self.active_connections.append(websocket)

    def disconnect(self, websocket: Any):
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)

    async def send(self, target: str, message: str, payload: Optional[Dict[str, Any]] = None) -> bool:
        data = {
            "target": target,
            "message": message,
            "payload": payload or {},
            "timestamp": datetime.now(timezone.utc).isoformat()
        }
        text_data = json.dumps(data)
        stale_connections = []
        for connection in self.active_connections:
            try:
                await connection.send_text(text_data)
            except Exception as e:
                logger.warning(f"WebSocket client send error: {e}")
                stale_connections.append(connection)
        for stale in stale_connections:
            self.disconnect(stale)
        return True

class AuditLogChannel(NotificationChannel):
    """Writes alert escalation audit entries to log stream."""
    async def send(self, target: str, message: str, payload: Optional[Dict[str, Any]] = None) -> bool:
        logger.info(f"[AUDIT LOG] Target: {target} | Message: {message} | Payload: {payload}")
        return True

class StubSMSChannel(NotificationChannel):
    """Stub for external SMS gateway (e.g. Twilio, AWS SNS). Extensible for future hardware rollout."""
    async def send(self, target: str, message: str, payload: Optional[Dict[str, Any]] = None) -> bool:
        logger.info(f"[STUB SMS] (SMS gateway would dispatch to {target}): {message}")
        return True

class StubEmailChannel(NotificationChannel):
    """Stub for supervisor email notifications (e.g. SendGrid / AWS SES)."""
    async def send(self, target: str, message: str, payload: Optional[Dict[str, Any]] = None) -> bool:
        logger.info(f"[STUB EMAIL] (Email dispatcher to {target}): {message}")
        return True

class NotificationService:
    """
    Pluggable escalation and notification service interface.
    Dispatches alerts across configured channels (In-App WebSocket, Log, SMS, Email).
    """
    def __init__(self):
        self.ws_channel = WebSocketChannel()
        self.channels: Dict[str, NotificationChannel] = {
            "websocket": self.ws_channel,
            "log": AuditLogChannel(),
            "sms": StubSMSChannel(),
            "email": StubEmailChannel()
        }

    def register_channel(self, name: str, channel: NotificationChannel):
        self.channels[name] = channel

    async def notify(self, channels: List[str], target: str, message: str, payload: Optional[Dict[str, Any]] = None):
        results = {}
        for ch_name in channels:
            if ch_name in self.channels:
                try:
                    success = await self.channels[ch_name].send(target, message, payload)
                    results[ch_name] = success
                except Exception as ex:
                    logger.error(f"Error sending on channel {ch_name}: {ex}")
                    results[ch_name] = False
        return results

# Singleton instance for backend use
notification_service = NotificationService()
