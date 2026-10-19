"""Field values are stored only as one Fernet token per channel (AES-128-CBC + HMAC-SHA256).

Keys rotate through MultiFernet: the first key encrypts, every key decrypts.
"""

import json
from typing import Any, Dict, Sequence

from cryptography.fernet import Fernet, InvalidToken, MultiFernet


class SealedDataError(RuntimeError):
    """A stored token does not open with the configured key (key changed or data tampered with)."""


class FieldCipher:
    """Seals a channel's field values into a token and opens it again."""

    def __init__(self, keys: Sequence[bytes]) -> None:
        self._fernet = MultiFernet([Fernet(key) for key in keys])
        self.rotating = len(keys) > 1

    def seal(self, values: Dict[str, Any]) -> str:
        return self._fernet.encrypt(json.dumps(values, separators=(",", ":")).encode()).decode()

    def open(self, token: str) -> Dict[str, Any]:
        try:
            return json.loads(self._fernet.decrypt(token.encode()))
        except InvalidToken as error:
            raise SealedDataError("stored channel fields could not be decrypted") from error

    def reseal(self, token: str) -> str:
        """The same values, encrypted with the current key."""
        try:
            return self._fernet.rotate(token.encode()).decode()
        except InvalidToken as error:
            raise SealedDataError("stored channel fields could not be decrypted") from error
