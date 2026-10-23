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
