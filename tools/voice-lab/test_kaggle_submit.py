import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from kaggle_submit import blocked  # noqa: E402


def test_old_account_is_blocked_by_default():
    assert blocked("trnntr", "trnntr")
    assert blocked("TrnnTR", "trnntr")


def test_other_accounts_pass():
    assert not blocked("xoteam", "trnntr")
    assert not blocked("xoteam", "")


def test_list_of_accounts():
    assert blocked("b", " a , b ")


def test_waits_for_a_new_dataset_to_be_ready(monkeypatch):
    import types
    import kaggle_submit
    answers = iter(["pending", "pending", "ready"])
    calls = []
    def fake(*args, **kw):
        calls.append(args)
        return types.SimpleNamespace(stdout=next(answers))
    monkeypatch.setattr(kaggle_submit, "command", fake)
    monkeypatch.setattr(kaggle_submit.time, "sleep", lambda s: None)
    kaggle_submit.wait_ready("xoelite/job", limit=60, step=0)
    assert len(calls) == 3 and calls[0] == ("datasets", "status", "xoelite/job")


def test_a_dataset_in_error_stops_the_job(monkeypatch):
    import types
    import pytest
    import kaggle_submit
    monkeypatch.setattr(kaggle_submit, "command", lambda *a, **k: types.SimpleNamespace(stdout="error"))
    with pytest.raises(SystemExit):
        kaggle_submit.wait_ready("xoelite/job", limit=60, step=0)
