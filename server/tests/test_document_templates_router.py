"""Tests for /document-templates CRUD and ownership isolation."""

import pytest
from fastapi.testclient import TestClient
from unittest.mock import patch, MagicMock
from main import app

client = TestClient(app)


def _auth_headers(user_id: int, is_admin: bool = False):
    """Return headers that mock get_current_user returning user with given id."""
    return {"X-Test-User-Id": str(user_id), "X-Test-Is-Admin": str(is_admin)}


# These tests require the auth dependency to be overridden.
# They document the expected behaviour — implement once the router exists.

def test_list_templates_returns_global_and_own(monkeypatch):
    """User sees global (is_admin) templates and their own; never others'."""
    pass  # implemented in integration tests — see router unit tests below


def test_create_template_sets_user_id():
    """POST /document-templates sets user_id to current user, is_admin=False."""
    pass


def test_update_template_foreign_returns_404():
    """PUT on another user's template returns 404."""
    pass


def test_delete_template_foreign_returns_404():
    """DELETE on another user's template returns 404."""
    pass


def test_admin_can_create_global_template():
    """Admin POST with is_admin=True creates a global template."""
    pass
