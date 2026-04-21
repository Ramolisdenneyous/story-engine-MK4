import { Adventure, AdventureSummary, SessionDetail } from "../appTypes";

type FeedbackTabProps = {
  detail: SessionDetail;
  feedbackText: string;
  feedbackSubmitting: boolean;
  feedbackSubmittedAt: string;
  selectedAdventure: Adventure | null;
  selectedAdventureSummary: AdventureSummary | null;
  onSetFeedbackText: (value: string) => void;
  onSubmitFeedback: () => void;
  displayAdventureTitle: (adventure: AdventureSummary | Adventure | null) => string;
};

export function FeedbackTab({
  detail,
  feedbackText,
  feedbackSubmitting,
  feedbackSubmittedAt,
  selectedAdventure,
  selectedAdventureSummary,
  onSetFeedbackText,
  onSubmitFeedback,
  displayAdventureTitle,
}: FeedbackTabProps) {
  return (
    <section className="panel">
      <article className="card feedback-card">
        <div className="card-head">
          <span>Feedback</span>
          <h2>Tell Me What Worked and What Needs Attention</h2>
        </div>
        <p className="card-copy">
          Your notes will be saved with this session so I can review them alongside the adventure setup, party build, and prompt count.
        </p>
        <div className="feedback-meta">
          <span>Adventure: {displayAdventureTitle(selectedAdventure ?? selectedAdventureSummary)}</span>
          <span>Prompts this session: {detail.session.prompt_index}</span>
          <span>Party size: {detail.tab1.party.length}</span>
        </div>
        <textarea
          className="feedback-textarea"
          value={feedbackText}
          onChange={(event) => onSetFeedbackText(event.target.value)}
          placeholder="What felt clear, confusing, too slow, or especially good?"
        />
        <div className="action-row">
          <button className="btn accent" type="button" onClick={onSubmitFeedback} disabled={feedbackSubmitting || !feedbackText.trim()}>
            {feedbackSubmitting ? "Submitting..." : "Submit"}
          </button>
        </div>
        {feedbackSubmittedAt && <p className="inline-guidance">Feedback saved at {new Date(feedbackSubmittedAt).toLocaleString()}.</p>}
      </article>
    </section>
  );
}
