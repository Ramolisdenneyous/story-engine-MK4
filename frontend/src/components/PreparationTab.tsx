import { useEffect, useMemo, useRef, useState } from "react";
import { resolveApiUrl } from "../api";
import { Adventure, AdventureSummary, CatalogBoot, SessionDetail } from "../appTypes";

type PreparationTabProps = {
  catalogBoot: CatalogBoot;
  detail: SessionDetail;
  adventureId: string;
  setAdventureId: (value: string) => void;
  selectedPlayerIds: string[];
  classByPlayer: Record<string, string>;
  selectedAdventureSummary: AdventureSummary | null;
  selectedAdventure: Adventure | null;
  loading: boolean;
  chapterStarting: boolean;
  startReady: boolean;
  startChapterHint: string;
  loadingPulse: string;
  onTogglePlayer: (playerId: string) => void;
  onSetPlayerClass: (playerId: string, classId: string) => void;
  onSaveTab1: () => void;
  onStartChapter: () => void;
  onResetChapter: () => void;
  displayAdventureTitle: (adventure: AdventureSummary | Adventure | null) => string;
};

const MISSION_PIP_POSITIONS: Record<string, { left: number; top: number }> = {
  "icebane-castle": { left: 90, top: 18 },
  "east-marsh-raid": { left: 75, top: 37 },
  "telas-wagons": { left: 63, top: 58 },
  "old-people-barrow": { left: 36, top: 47 },
  "collecting-taxes": { left: 59, top: 73 },
  "endless-glacier-undead": { left: 34, top: 12 },
};

const ADVENTURE_PREVIEW_IMAGES: Record<string, string> = {
  "icebane-castle": "/assets/Preview-Adventure1.webp",
  "east-marsh-raid": "/assets/Preview-Adventure2.webp",
  "telas-wagons": "/assets/Preview-Adventure3.webp",
  "old-people-barrow": "/assets/Preview-Adventure4.webp",
  "collecting-taxes": "/assets/Preview-Adventure5.webp",
  "endless-glacier-undead": "/assets/Preview-Adventure6.webp",
};

function portraitCandidates(playerId: string, classId: string, fallbackUrl: string) {
  const stem = `${playerId}-${classId}`;
  return [
    resolveApiUrl(`/assets/${stem}.jpg`),
    resolveApiUrl(`/assets/${playerId}-${classId.toLowerCase()}.jpg`),
    resolveApiUrl(`/assets/${playerId}-${classId.toUpperCase()}.jpg`),
    resolveApiUrl(`/assets/${playerId}-${classId.charAt(0).toUpperCase()}${classId.slice(1).toLowerCase()}.jpg`),
    fallbackUrl,
  ];
}

function PortraitTileImage({
  playerId,
  classId,
  fallbackUrl,
  alt,
}: {
  playerId: string;
  classId: string | null;
  fallbackUrl: string;
  alt: string;
}) {
  const candidates = useMemo(
    () => (classId ? portraitCandidates(playerId, classId, fallbackUrl) : [fallbackUrl]),
    [classId, fallbackUrl, playerId],
  );
  const [candidateIndex, setCandidateIndex] = useState(0);

  useEffect(() => {
    setCandidateIndex(0);
  }, [candidates]);

  return (
    <img
      src={candidates[Math.min(candidateIndex, candidates.length - 1)]}
      alt={alt}
      onError={() => {
        setCandidateIndex((current) => (current < candidates.length - 1 ? current + 1 : current));
      }}
    />
  );
}

export function PreparationTab({
  catalogBoot,
  detail,
  adventureId,
  setAdventureId,
  selectedPlayerIds,
  classByPlayer,
  selectedAdventureSummary,
  selectedAdventure,
  loading,
  chapterStarting,
  startReady,
  startChapterHint,
  loadingPulse,
  onTogglePlayer,
  onSetPlayerClass,
  onSaveTab1,
  onStartChapter,
  onResetChapter,
  displayAdventureTitle,
}: PreparationTabProps) {
  const [hoveredAdventureId, setHoveredAdventureId] = useState("");
  const [mobileStep, setMobileStep] = useState<"mission" | "party">("mission");
  const chapterLoadingRef = useRef<HTMLParagraphElement | null>(null);
  const hoveredAdventure = catalogBoot.adventures.find((adventure) => adventure.adventure_id === hoveredAdventureId) ?? null;
  const displayedAdventure = hoveredAdventure ?? selectedAdventureSummary ?? null;

  useEffect(() => {
    if (!adventureId) {
      setMobileStep("mission");
    }
  }, [adventureId]);

  useEffect(() => {
    if (!chapterStarting) return;
    window.requestAnimationFrame(() => {
      chapterLoadingRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  }, [chapterStarting]);

  return (
    <section className="panel">
      <div className="mobile-prep-flow">
        {mobileStep === "mission" && (
          <article className="card map-card map-card--mission">
            <div className="card-head">
              <span>Preparation</span>
              <h2>{selectedAdventureSummary ? "Confirm Mission" : "Choose a Mission"}</h2>
            </div>

            {!selectedAdventureSummary && (
              <div className="setting-map-shell">
                <img className="media setting-map-image" src={resolveApiUrl(catalogBoot.map_image_url)} alt="Valaska setting map" />
                {catalogBoot.adventures.map((adventure, index) => {
                  const position = MISSION_PIP_POSITIONS[adventure.adventure_id];
                  if (!position) return null;
                  return (
                    <button
                      key={adventure.adventure_id}
                      type="button"
                      className="map-pip"
                      style={{ left: `${position.left}%`, top: `${position.top}%` }}
                      onClick={() => setAdventureId(adventure.adventure_id)}
                      aria-label={`${index + 1}. ${displayAdventureTitle(adventure)}`}
                    >
                      {index + 1}
                    </button>
                  );
                })}
              </div>
            )}

            {selectedAdventureSummary && (
              <div className="mobile-mission-preview">
                <img
                  src={resolveApiUrl(ADVENTURE_PREVIEW_IMAGES[selectedAdventureSummary.adventure_id] ?? catalogBoot.default_image_url)}
                  alt={displayAdventureTitle(selectedAdventureSummary)}
                />
                <div className="mobile-mission-preview-copy">
                  <strong>{displayAdventureTitle(selectedAdventure ?? selectedAdventureSummary)}</strong>
                  <p>
                    {selectedAdventure
                      ? selectedAdventure.objectives.map((objective) => objective.description).join(" | ")
                      : selectedAdventureSummary.description}
                  </p>
                </div>
                <div className="mobile-preview-actions">
                  <button className="btn" type="button" onClick={() => setAdventureId("")}>Return</button>
                  <button className="btn accent" type="button" onClick={() => setMobileStep("party")}>Accept</button>
                </div>
              </div>
            )}
          </article>
        )}

        {mobileStep === "party" && (
          <article className="card mobile-party-card">
            <div className="card-head">
              <span>Build the Party</span>
              <h2>Select Four Players</h2>
              <small>{selectedPlayerIds.length}/4</small>
            </div>
            <div className="mobile-party-grid">
              {catalogBoot.players.map((player) => {
                const selected = selectedPlayerIds.includes(player.player_id);
                const selectedClassId = classByPlayer[player.player_id] ?? "";
                const savedPortrait = detail.tab1.party.find((member) => member.player_id === player.player_id)?.portrait_url ?? player.image_url;
                return (
                  <div
                    key={player.player_id}
                    className={selected ? "mobile-player-card selected" : "mobile-player-card"}
                    onClick={() => onTogglePlayer(player.player_id)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        onTogglePlayer(player.player_id);
                      }
                    }}
                    role="button"
                    tabIndex={0}
                  >
                    <PortraitTileImage
                      playerId={player.player_id}
                      classId={selected && selectedClassId ? selectedClassId : null}
                      fallbackUrl={resolveApiUrl(savedPortrait)}
                      alt={player.name}
                    />
                    <strong>{player.name}</strong>
                    {selected && (
                      <select
                        value={selectedClassId}
                        onClick={(event) => event.stopPropagation()}
                        onChange={(event) => onSetPlayerClass(player.player_id, event.target.value)}
                      >
                        <option value="">Class</option>
                        {catalogBoot.classes.map((classItem) => (
                          <option key={classItem.class_id} value={classItem.class_id}>
                            {classItem.name}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>
                );
              })}
            </div>
            <div className="mobile-preview-actions">
              <button className="btn" type="button" onClick={() => setMobileStep("mission")}>Mission</button>
              {!detail.session.tab1_locked && (
                <span className="button-tooltip-wrap" title={loading || startReady ? "" : startChapterHint}>
                  <button className="btn accent" type="button" onClick={onStartChapter} disabled={loading || !startReady}>Start Chapter</button>
                </span>
              )}
              {detail.session.tab1_locked && <button className="btn danger" type="button" onClick={onResetChapter} disabled={loading}>Reset Chapter</button>}
            </div>
            {!detail.session.tab1_locked && !startReady && <p className="inline-guidance">{startChapterHint}</p>}
          </article>
        )}
      </div>

      <div className="panel-grid panel-grid--tab1-phase1 desktop-prep-flow">
        <article className="card map-card map-card--mission">
          <div className="card-head">
            <span>Preparation</span>
            <h2>Choose a Mission on the Setting Map</h2>
          </div>
          <div className="setting-map-shell">
            <img className="media setting-map-image" src={resolveApiUrl(catalogBoot.map_image_url)} alt="Valaska setting map" />
            {catalogBoot.adventures.map((adventure, index) => {
              const position = MISSION_PIP_POSITIONS[adventure.adventure_id];
              if (!position) return null;
              return (
                <button
                  key={adventure.adventure_id}
                  type="button"
                  className={adventureId === adventure.adventure_id ? "map-pip selected" : "map-pip"}
                  style={{ left: `${position.left}%`, top: `${position.top}%` }}
                  onClick={() => setAdventureId(adventure.adventure_id)}
                  onMouseEnter={() => setHoveredAdventureId(adventure.adventure_id)}
                  onMouseLeave={() => setHoveredAdventureId("")}
                  aria-label={`${index + 1}. ${displayAdventureTitle(adventure)}`}
                >
                  {index + 1}
                </button>
              );
            })}
            {displayedAdventure && (
              <div className="map-hover-card">
                <img
                  className="map-hover-preview"
                  src={resolveApiUrl(ADVENTURE_PREVIEW_IMAGES[displayedAdventure.adventure_id] ?? catalogBoot.default_image_url)}
                  alt={displayAdventureTitle(displayedAdventure)}
                />
                <strong>{displayAdventureTitle(displayedAdventure)}</strong>
                <p>{displayedAdventure.description}</p>
              </div>
            )}
          </div>
          <p className="card-copy">Every session begins in Moosehearth. Hover over a numbered pip to preview the mission, then click to lock in the adventure you want to play.</p>
        </article>

        <article className="card">
          <div className="card-head">
            <span>Build the Party</span>
            <h2>Select Four Players and Assign Their Classes</h2>
          </div>
          <div className="player-grid player-grid--phase1">
            {catalogBoot.players.map((player) => {
              const selected = selectedPlayerIds.includes(player.player_id);
              const selectedClassId = classByPlayer[player.player_id] ?? "";
              const savedPortrait = detail.tab1.party.find((member) => member.player_id === player.player_id)?.portrait_url ?? player.image_url;
              return (
                <div
                  key={player.player_id}
                  className={selected ? "player-tile player-tile--phase1 selected" : "player-tile player-tile--phase1"}
                  onClick={() => onTogglePlayer(player.player_id)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      onTogglePlayer(player.player_id);
                    }
                  }}
                  role="button"
                  tabIndex={0}
                >
                  <div className="player-tile-portrait">
                    <PortraitTileImage
                      playerId={player.player_id}
                      classId={selected && selectedClassId ? selectedClassId : null}
                      fallbackUrl={resolveApiUrl(savedPortrait)}
                      alt={player.name}
                    />
                  </div>
                  <div className="player-tile-copy">
                    <strong>{player.name}</strong>
                    <span>{player.keywords.join(" | ")}</span>
                  </div>
                  {selected && (
                    <select
                      value={selectedClassId}
                      onClick={(event) => event.stopPropagation()}
                      onChange={(event) => onSetPlayerClass(player.player_id, event.target.value)}
                    >
                      <option value="">Choose class</option>
                      {catalogBoot.classes.map((classItem) => (
                        <option key={classItem.class_id} value={classItem.class_id}>
                          {classItem.name}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              );
            })}
          </div>
        </article>
      </div>

      {selectedAdventureSummary && (
        <div className="summary-bar desktop-prep-flow">
          <strong>{displayAdventureTitle(selectedAdventure ?? selectedAdventureSummary)}</strong>
          <span>
            {selectedAdventure
              ? selectedAdventure.objectives.map((objective) => objective.description).join(" | ")
              : selectedAdventureSummary.description}
          </span>
        </div>
      )}

      <div className="action-row desktop-prep-flow">
        <button className="btn" onClick={onSaveTab1} disabled={loading}>Save Page</button>
        {!detail.session.tab1_locked && (
          <span className="button-tooltip-wrap" title={loading || startReady ? "" : startChapterHint}>
            <button className="btn accent" onClick={onStartChapter} disabled={loading || !startReady}>Start Chapter</button>
          </span>
        )}
        {detail.session.tab1_locked && <button className="btn danger" onClick={onResetChapter} disabled={loading}>Reset Chapter</button>}
      </div>
      {chapterStarting && (
        <p className="chapter-loading-notice" ref={chapterLoadingRef}>
          <span>Preparing Adventure</span>
          <span className="chapter-loading-dots">{loadingPulse}</span>
        </p>
      )}
      {!detail.session.tab1_locked && !startReady && <p className="inline-guidance desktop-prep-flow">{startChapterHint}</p>}
    </section>
  );
}
