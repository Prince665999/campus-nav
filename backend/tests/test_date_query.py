"""Tests for date_query (finding dates in a question) and the date path of
the document chat."""

from datetime import date
from unittest.mock import patch

from backend.api.services import chat_doc_service, date_query

TODAY = date(2026, 10, 19)


def needles(q):
    return date_query.find_date_needles(q, today=TODAY)


def test_full_date_with_weekday_and_year():
    assert needles("what is happening on friday may 1 of 2026") == (
        ["2026-05-01)"], []
    )


def test_day_month_year():
    assert needles("What is happening on Friday, 1 May 2026?")[0] == ["2026-05-01)"]


def test_no_year_matches_any_year():
    assert needles("events on may 1")[0] == ["-05-01)"]
    assert needles("1st of May")[0] == ["-05-01)"]


def test_swahili_month():
    assert needles("nini kinatokea 1 Mei 2026")[0] == ["2026-05-01)"]
    assert needles("tarehe 15 Oktoba")[0] == ["-10-15)"]


def test_iso_and_numeric_day_first():
    assert needles("what about 2026-12-25")[0] == ["2026-12-25)"]
    assert needles("exam on 05/03/2026")[0] == ["2026-03-05)"]


def test_relative_days():
    assert needles("what is on tomorrow")[0] == ["2026-10-20)"]
    assert needles("leo kuna nini")[0] == ["2026-10-19)"]
    assert needles("what happened yesterday")[0] == ["2026-10-18)"]


def test_month_only():
    assert needles("what happens in May") == ([], ["-05-"])
    assert needles("mwezi wa Novemba") == ([], ["-11-"])


def test_two_dates():
    assert needles("what is on 30 April and 1 May")[0] == ["-04-30)", "-05-01)"]


def test_no_false_positives():
    assert needles("when is college board appeal") == ([], [])
    assert needles("what may happen next") == ([], [])
    assert needles("Room 12 on the 3rd floor") == ([], [])
    assert needles("31 February 2026") == ([], [])


# ---- the chat path ----------------------------------------------------

LABOUR = {
    "text": "On Friday, 1 May 2026 (2026-05-01), there is one event: Labour Day.",
    "metadata": {"source_file": "almanac.md", "page_number": 1},
    "score": 1.0,
}
RANDOM = {
    "text": "On Monday, 5 January 2026 (2026-01-05), there are 2 events: ...",
    "metadata": {"source_file": "almanac.md", "page_number": 1},
    "score": 0.4,
}


def test_date_chunk_goes_first_and_reaches_the_model():
    seen = {}

    def fake_chat(messages, **kwargs):
        seen["prompt"] = messages[-1]["content"]
        return "Labour Day."

    with patch.object(chat_doc_service.knowledge_service, "retrieve",
                      return_value=[RANDOM]), \
         patch.object(chat_doc_service.knowledge_service, "retrieve_containing",
                      return_value=[LABOUR]), \
         patch.object(chat_doc_service.llm_client, "is_available",
                      return_value=True), \
         patch.object(chat_doc_service.llm_client, "chat", side_effect=fake_chat):
        reply, used = chat_doc_service.answer_doc_question(
            "what is happening on friday may 1 of 2026"
        )

    assert used is True
    assert reply == "Labour Day."
    assert seen["prompt"].index("Labour Day") < seen["prompt"].index("5 January")


def test_date_with_no_entry_gives_the_model_a_note():
    seen = {}

    def fake_chat(messages, **kwargs):
        seen["prompt"] = messages[-1]["content"]
        return "Nothing listed."

    with patch.object(chat_doc_service.knowledge_service, "retrieve",
                      return_value=[RANDOM]), \
         patch.object(chat_doc_service.knowledge_service, "retrieve_containing",
                      return_value=[]), \
         patch.object(chat_doc_service.llm_client, "is_available",
                      return_value=True), \
         patch.object(chat_doc_service.llm_client, "chat", side_effect=fake_chat):
        chat_doc_service.answer_doc_question("what is on 2 May 2026")

    assert "no entry was found" in seen["prompt"]


def test_question_without_a_date_is_unchanged():
    with patch.object(chat_doc_service.knowledge_service, "retrieve",
                      return_value=[RANDOM]) as retrieve, \
         patch.object(chat_doc_service.knowledge_service, "retrieve_containing",
                      return_value=[LABOUR]) as lookup, \
         patch.object(chat_doc_service.llm_client, "is_available",
                      return_value=False):
        reply, used = chat_doc_service.answer_doc_question("when is college board")

    lookup.assert_not_called()
    assert used is True
    assert "5 January" in reply
