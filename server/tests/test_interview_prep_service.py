from unittest.mock import MagicMock, patch

from intelligence.service import INTERVIEW_PREP_PARSE_ERROR, generate_interview_prep

UNPARSABLE_ANSWER = "{ definitely: not json } SECRET-RAW-MODEL-OUTPUT"


def test_unparsable_ai_answer_is_stored_as_a_fixed_error_without_raw_output(fake_redis):
    client = MagicMock()
    client.chat.completions.create.return_value.choices = [MagicMock(message=MagicMock(content=UNPARSABLE_ANSWER))]
    with patch("intelligence.service._get_redis", return_value=fake_redis):
        result = generate_interview_prep("Dev", "Acme", "Build", "CV", model="m", client=client)
    assert result == {"error": INTERVIEW_PREP_PARSE_ERROR}
