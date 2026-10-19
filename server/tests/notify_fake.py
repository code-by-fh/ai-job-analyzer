"""An in-memory notification service behind the NotificationsClient interface (the system boundary).

Channels are kept per owner like the real service; secret fields come back only as "set" / "not set".
``fail_with`` makes the next calls raise a NotifyError; ``sent`` and ``tested`` record what would go out.
"""

import uuid
from typing import Any, Dict, List, Optional

from services.notifications_client import NOT_FOUND, NotifyError

SECRET_FIELDS = {
    "pushover": ("api_token", "user_key"),
    "resend": ("api_key",),
    "mailjet": ("api_key", "secret_key"),
    "smtp": ("password",),
}
CHANNEL_TYPES = [{"id": channel_type, "label": {"de": channel_type, "en": channel_type}, "fields": []} for channel_type in SECRET_FIELDS]
FIXED_TIME = "2026-10-16T08:00:00Z"


class FakeNotifications:
    def __init__(self) -> None:
        self.channels: Dict[str, Dict[str, Any]] = {}
        self.sent: List[Dict[str, Any]] = []
        self.tested: List[str] = []
        self.previews: List[Dict[str, Any]] = []
        self.error: Optional[NotifyError] = None
        self.delivered = True

    def fail_with(self, error: Optional[NotifyError]) -> None:
        self.error = error

    def _check(self) -> None:
        if self.error is not None:
            raise self.error

    def _out(self, channel: Dict[str, Any]) -> Dict[str, Any]:
        secret_names = SECRET_FIELDS[channel["type"]]
        values = channel["values"]
        return {
            "id": channel["id"], "type": channel["type"], "name": channel["name"], "owner": channel["owner"],
            "fields": {name: value for name, value in values.items() if name not in secret_names},
            "secrets": {name: "set" if values.get(name) else "not set" for name in secret_names},
            "created_at": FIXED_TIME, "updated_at": FIXED_TIME,
        }

    def _owned(self, owner: str, channel_id: str) -> Dict[str, Any]:
        channel = self.channels.get(str(channel_id))
        if channel is None or channel["owner"] != owner:
            raise NotifyError(NOT_FOUND)
        return channel

    def add(self, owner: str, channel_type: str, values: Dict[str, Any], name: str = "Kanal") -> str:
        """Seed a channel directly; returns its id."""
        channel_id = str(uuid.uuid4())
        self.channels[channel_id] = {"id": channel_id, "owner": owner, "type": channel_type, "name": name, "values": dict(values)}
        return channel_id

    def values(self, channel_id: str) -> Dict[str, Any]:
        return self.channels[channel_id]["values"]

    def channel_types(self) -> List[Dict[str, Any]]:
        self._check()
        return CHANNEL_TYPES

    def list_channels(self, owner: str) -> List[Dict[str, Any]]:
        self._check()
        return [self._out(channel) for channel in self.channels.values() if channel["owner"] == owner]

    def get_channel(self, owner: str, channel_id: str) -> Dict[str, Any]:
        self._check()
        return self._out(self._owned(owner, channel_id))

    def create_channel(self, owner: str, channel: Dict[str, Any]) -> Dict[str, Any]:
        self._check()
        values = {name: value for name, value in channel["fields"].items() if value is not None}
        return self._out(self.channels[self.add(owner, channel["type"], values, channel["name"])])

    def update_channel(self, owner: str, channel_id: str, change: Dict[str, Any]) -> Dict[str, Any]:
        self._check()
        channel = self._owned(owner, channel_id)
        channel["name"] = change.get("name") or channel["name"]
        for name, value in change.get("fields", {}).items():
            if value is None:
                channel["values"].pop(name, None)
            else:
                channel["values"][name] = value
        return self._out(channel)

    def delete_channel(self, owner: str, channel_id: str) -> None:
        self._check()
        del self.channels[self._owned(owner, channel_id)["id"]]

    def delete_owner_channels(self, owner: str) -> int:
        channels = self.list_channels(owner)
        for channel in channels:
            self.delete_channel(owner, channel["id"])
        return len(channels)

    def test_channel(self, owner: str, channel_id: str) -> Dict[str, Any]:
        self._check()
        self._owned(owner, channel_id)
        self.tested.append(str(channel_id))
        return {"channel_id": str(channel_id), "delivered": self.delivered, "reason": None if self.delivered else "auth_rejected"}

    def send(self, owner: str, notification: Dict[str, Any]) -> List[Dict[str, Any]]:
        self._check()
        ids = notification.get("channel_ids") or [channel["id"] for channel in self.list_channels(owner)]
        for channel_id in ids:
            self._owned(owner, channel_id)
        self.sent.append({"owner": owner, **notification})
        reason = None if self.delivered else "rejected"
        return [{"channel_id": channel_id, "delivered": self.delivered, "reason": reason} for channel_id in ids]

    def preview(self, template: Dict[str, Any]) -> Dict[str, Any]:
        self._check()
        self.previews.append(template)
        return {"subject": "Betreff", "html": f"<p>{template.get('html') or 'default'}</p>", "push_text": template.get("push_text") or "default"}
