from app.services.categoriser import categorise, reload_rules


def test_categorise_groceries():
    assert categorise("TESCO STORES 1234") == "Groceries"
    assert categorise("SAINSBURY'S SUPERMARKET") == "Groceries"


def test_categorise_transport():
    assert categorise("TFL TRAVEL CHARGE") == "Transport"
    assert categorise("UBER TRIP HTTPS://HELP.UB") == "Transport"


def test_categorise_subscriptions():
    assert categorise("NETFLIX.COM") == "Subscriptions"
    assert categorise("SPOTIFY PREMIUM") == "Subscriptions"


def test_categorise_dining():
    assert categorise("NANDOS RESTAURANT") == "Dining Out"
    assert categorise("MCDONALD'S #12345") == "Dining Out"


def test_categorise_default():
    assert categorise("RANDOM UNKNOWN MERCHANT XYZ") == "Other"


def test_categorise_income():
    assert categorise("SALARY PAYMENT") == "Income"
    assert categorise("BACS CREDIT FROM EMPLOYER") == "Income"


def test_reload_rules():
    reload_rules()
    # After reload, rules should still work
    assert categorise("COSTA COFFEE") == "Coffee & Snacks"
