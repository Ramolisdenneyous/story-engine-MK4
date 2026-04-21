import { CSSProperties, useEffect, useMemo, useRef, useState } from "react";
import { resolveApiUrl } from "../../api";
import { AdventureLocation, AttackResolvedPayload, Monster, OPPOSITION_SLOT, OppositionState, PartyMember, SessionDetail, SLOT_COLORS } from "../../appTypes";

type LocationView = "world" | "adventure" | "encounter";

type LocationCellProps = {
  detail: SessionDetail;
  worldMapImageUrl: string;
  encounterImageUrl: string;
  activeAgentSlot: number;
  activeLocation: AdventureLocation | null;
  adventureLocations: AdventureLocation[];
  gmMonsters: Monster[];
  activeOpposition: OppositionState | null;
  travelLoading: boolean;
  locationView: LocationView;
  onSetActiveLocationId: (locationId: string) => void;
  onSetLocationView: (view: LocationView) => void;
  onTravelToSelectedLocation: () => void;
  displayAdventureTitle: (adventure: SessionDetail["tab1"]["active_adventure"]) => string;
  encounterLocationTitle: string;
  playedAttackEventIds: string[];
  onAnimationStateChange: (locked: boolean) => void;
  onAnimationSettled: () => Promise<SessionDetail>;
  onMarkAttackAnimationPlayed: (eventId: string) => void;
};

type DisplayOppositionEntry = {
  monsterId: string;
  displayName: string;
  currentHp: number;
  hpMax: number;
  imageUrl: string;
  isDying: boolean;
};

type PendingAttackResolution = AttackResolvedPayload & {
  eventId: string;
  promptIndex: number;
};

type OverlayPlayerCard = {
  slot: number;
  playerName: string;
  classId: string;
  portraitUrl: string;
  hpCurrent: number;
  hpMax: number;
  rowIndex: number;
  role: "actor" | "target";
  hit: boolean;
  defeated: boolean;
};

type OverlayMonsterCard = {
  monsterId: string;
  displayName: string;
  imageUrl: string;
  hpCurrent: number;
  hpMax: number;
  rowIndex: number;
  role: "actor" | "target";
  hit: boolean;
  defeated: boolean;
};

type AttackOverlayScene = {
  mode: "single-player" | "single-monster" | "monster-batch";
  eventIds: string[];
  players: OverlayPlayerCard[];
  monsters: OverlayMonsterCard[];
};

function hpLossPercent(current: number, max: number) {
  if (max <= 0) return 100;
  return Math.max(0, Math.min(100, ((max - current) / max) * 100));
}

function buildOppositionDisplayEntries(opposition: OppositionState | null, monsters: Monster[]) {
  if (!opposition?.active) return [] as DisplayOppositionEntry[];
  const monsterCard = monsters.find((monster) => monster.monster_id === opposition.monster_type);
  if (!monsterCard) return [] as DisplayOppositionEntry[];
  const imageUrl = resolveApiUrl(monsterCard.image_url);
  return opposition.instances
    .slice(0, 4)
    .map((instance) => ({
      monsterId: instance.monster_id,
      displayName: instance.display_name,
      currentHp: instance.current_hp,
      hpMax: instance.hp_max,
      imageUrl,
      isDying: instance.is_dead || instance.current_hp <= 0,
    }));
}

function buildAttackGroups(detail: SessionDetail, playedAttackEventIds: string[]) {
  const played = new Set(playedAttackEventIds);
  const groups: PendingAttackResolution[][] = [];
  for (const event of detail.events) {
    if (event.kind !== "attack_resolved" || played.has(event.event_id)) {
      continue;
    }
    const entry: PendingAttackResolution = {
      eventId: event.event_id,
      promptIndex: event.prompt_index,
      ...(event.json_payload as AttackResolvedPayload),
    };
    const currentGroup = groups[groups.length - 1];
    if (currentGroup && currentGroup[0]?.promptIndex === entry.promptIndex) {
      currentGroup.push(entry);
    } else {
      groups.push([entry]);
    }
  }
  return groups;
}

function buildOverlayScene(
  attackGroup: PendingAttackResolution[],
  party: PartyMember[],
  oppositionEntries: DisplayOppositionEntry[],
): AttackOverlayScene | null {
  if (!attackGroup.length) {
    return null;
  }
  const playersById = new Map(party.map((member) => [`pc:${member.slot}`, member]));
  const monstersById = new Map(oppositionEntries.map((entry) => [entry.monsterId, entry]));
  const allMonsterActors = attackGroup.every((entry) => !entry.actor_id.startsWith("pc:"));

  if (allMonsterActors && attackGroup.length > 1) {
    const actorOrder = oppositionEntries.map((entry) => entry.monsterId);
    const sortedEntries = [...attackGroup].sort((left, right) => actorOrder.indexOf(left.actor_id) - actorOrder.indexOf(right.actor_id));
    const targetRowById: Record<string, number> = {};
    const players: OverlayPlayerCard[] = [];
    const monsters: OverlayMonsterCard[] = [];

    sortedEntries.forEach((entry, index) => {
      const monster = monstersById.get(entry.actor_id);
      if (monster) {
        monsters.push({
          monsterId: monster.monsterId,
          displayName: monster.displayName,
          imageUrl: monster.imageUrl,
          hpCurrent: monster.currentHp,
          hpMax: monster.hpMax,
          rowIndex: index,
          role: "actor",
          hit: entry.hit,
          defeated: false,
        });
      }
      if (targetRowById[entry.target_id] === undefined) {
        targetRowById[entry.target_id] = index;
        const player = playersById.get(entry.target_id);
        if (player) {
          players.push({
            slot: player.slot,
            playerName: player.player_name,
            classId: player.class_id,
            portraitUrl: player.portrait_url,
            hpCurrent: player.hp_current,
            hpMax: player.hp_max,
            rowIndex: index,
            role: "target",
            hit: sortedEntries.some((item) => item.target_id === entry.target_id && item.hit),
            defeated: false,
          });
        }
      }
    });

    return {
      mode: "monster-batch",
      eventIds: sortedEntries.map((entry) => entry.eventId),
      players,
      monsters,
    };
  }

  const entry = attackGroup[0];
  const actorPlayer = playersById.get(entry.actor_id);
  const targetPlayer = playersById.get(entry.target_id);
  const actorMonster = monstersById.get(entry.actor_id);
  const targetMonster = monstersById.get(entry.target_id);

  return {
    mode: actorPlayer ? "single-player" : "single-monster",
    eventIds: [entry.eventId],
    players: [
      ...(actorPlayer ? [{
        slot: actorPlayer.slot,
        playerName: actorPlayer.player_name,
        classId: actorPlayer.class_id,
        portraitUrl: actorPlayer.portrait_url,
        hpCurrent: actorPlayer.hp_current,
        hpMax: actorPlayer.hp_max,
        rowIndex: 0,
        role: "actor" as const,
        hit: entry.hit,
        defeated: false,
      }] : []),
      ...(targetPlayer ? [{
        slot: targetPlayer.slot,
        playerName: targetPlayer.player_name,
        classId: targetPlayer.class_id,
        portraitUrl: targetPlayer.portrait_url,
        hpCurrent: targetPlayer.hp_current,
        hpMax: targetPlayer.hp_max,
        rowIndex: 0,
        role: "target" as const,
        hit: entry.hit,
        defeated: Boolean(entry.hit && entry.target_hp_after <= 0),
      }] : []),
    ],
    monsters: [
      ...(actorMonster ? [{
        monsterId: actorMonster.monsterId,
        displayName: actorMonster.displayName,
        imageUrl: actorMonster.imageUrl,
        hpCurrent: actorMonster.currentHp,
        hpMax: actorMonster.hpMax,
        rowIndex: 0,
        role: "actor" as const,
        hit: entry.hit,
        defeated: false,
      }] : []),
      ...(targetMonster ? [{
        monsterId: targetMonster.monsterId,
        displayName: targetMonster.displayName,
        imageUrl: targetMonster.imageUrl,
        hpCurrent: targetMonster.currentHp,
        hpMax: targetMonster.hpMax,
        rowIndex: 0,
        role: "target" as const,
        hit: entry.hit,
        defeated: Boolean(entry.hit && entry.target_hp_after <= 0),
      }] : []),
    ],
  };
}

function overlayRowStyle(rowIndex: number, total: number): CSSProperties {
  const offset = (rowIndex - ((total - 1) / 2)) * 96;
  return { top: `calc(50% + ${offset}px)` };
}

export function LocationCell({
  detail,
  worldMapImageUrl,
  encounterImageUrl,
  activeAgentSlot,
  activeLocation,
  adventureLocations,
  gmMonsters,
  activeOpposition,
  travelLoading,
  locationView,
  onSetActiveLocationId,
  onSetLocationView,
  onTravelToSelectedLocation,
  displayAdventureTitle,
  encounterLocationTitle,
  playedAttackEventIds,
  onAnimationStateChange,
  onAnimationSettled,
  onMarkAttackAnimationPlayed,
}: LocationCellProps) {
  const [activeOverlayScene, setActiveOverlayScene] = useState<AttackOverlayScene | null>(null);
  const previousOppositionEntriesRef = useRef<DisplayOppositionEntry[]>([]);
  const fadeTimerRef = useRef<number | null>(null);
  const animationTimerRef = useRef<number | null>(null);
  const selectedLocation = adventureLocations.find((location) => location.id === activeLocation?.id) ?? null;
  const liveOppositionEntries = useMemo(() => buildOppositionDisplayEntries(activeOpposition, gmMonsters), [activeOpposition, gmMonsters]);
  const pendingAttackGroups = useMemo(() => buildAttackGroups(detail, playedAttackEventIds), [detail, playedAttackEventIds]);
  const nextOverlayScene = useMemo(
    () => buildOverlayScene(pendingAttackGroups[0] ?? [], detail.tab1.party, liveOppositionEntries),
    [detail.tab1.party, liveOppositionEntries, pendingAttackGroups],
  );

  const playerRotationOrder = useMemo(() => {
    const playerBySlot = new Map(detail.tab1.party.map((member) => [member.slot, member]));
    const baseSlots = detail.session.combat_state.in_combat
      ? detail.session.combat_state.initiative_order
          .map((entry) => {
            if (entry === "opp:12") return OPPOSITION_SLOT;
            if (entry.startsWith("pc:")) return Number(entry.replace("pc:", ""));
            return Number(entry);
          })
          .filter((slot) => Number.isFinite(slot) && slot !== OPPOSITION_SLOT && playerBySlot.has(slot))
      : detail.tab1.selected_agent_slots.filter((slot) => playerBySlot.has(slot));
    const uniqueSlots = Array.from(new Set(baseSlots));
    if (!uniqueSlots.length) {
      return detail.tab1.party;
    }
    if (activeAgentSlot !== OPPOSITION_SLOT && uniqueSlots.includes(activeAgentSlot)) {
      const activeIndex = uniqueSlots.indexOf(activeAgentSlot);
      const rotated = [...uniqueSlots.slice(activeIndex), ...uniqueSlots.slice(0, activeIndex)];
      return rotated.map((slot) => playerBySlot.get(slot)!);
    }
    return uniqueSlots.map((slot) => playerBySlot.get(slot)!);
  }, [activeAgentSlot, detail.session.combat_state.in_combat, detail.session.combat_state.initiative_order, detail.tab1.party, detail.tab1.selected_agent_slots]);

  useEffect(() => {
    const previousEntries = previousOppositionEntriesRef.current;
    if (!previousEntries.length) {
      previousOppositionEntriesRef.current = liveOppositionEntries;
      return;
    }
    const liveIds = new Set(liveOppositionEntries.map((entry) => entry.monsterId));
    const removedDeadEntries = previousEntries
      .filter((entry) => !liveIds.has(entry.monsterId) && entry.isDying)
      .map((entry) => ({ ...entry, currentHp: 0, isDying: true }));
    previousOppositionEntriesRef.current = liveOppositionEntries;
    if (!removedDeadEntries.length) {
      return;
    }
    if (fadeTimerRef.current) {
      window.clearTimeout(fadeTimerRef.current);
    }
    fadeTimerRef.current = window.setTimeout(() => {
      fadeTimerRef.current = null;
    }, 2600);
  }, [liveOppositionEntries]);

  useEffect(() => {
    if (activeOverlayScene || !nextOverlayScene) {
      return;
    }
    onAnimationStateChange(true);
    nextOverlayScene.eventIds.forEach((eventId) => onMarkAttackAnimationPlayed(eventId));
    setActiveOverlayScene(nextOverlayScene);
    animationTimerRef.current = window.setTimeout(() => {
      animationTimerRef.current = null;
      void onAnimationSettled()
        .catch(() => undefined)
        .finally(() => {
          setActiveOverlayScene((current) => (
            current?.eventIds.join("|") === nextOverlayScene.eventIds.join("|") ? null : current
          ));
          onAnimationStateChange(false);
        });
    }, 5000);
  }, [activeOverlayScene, nextOverlayScene, onAnimationSettled, onAnimationStateChange, onMarkAttackAnimationPlayed]);

  useEffect(() => () => {
    if (fadeTimerRef.current) {
      window.clearTimeout(fadeTimerRef.current);
    }
    if (animationTimerRef.current) {
      window.clearTimeout(animationTimerRef.current);
    }
    onAnimationStateChange(false);
  }, [onAnimationStateChange]);

  function playerIsOverlayHidden(slot: number) {
    if (!activeOverlayScene) return false;
    return activeOverlayScene.players.some((entry) => entry.slot === slot);
  }

  function monsterIsOverlayHidden(monsterId: string) {
    if (!activeOverlayScene) return false;
    return activeOverlayScene.monsters.some((entry) => entry.monsterId === monsterId);
  }

  return (
    <article className="card location-cell">
      <div className="card-head">
        <span>Location Cell</span>
        <h2>{displayAdventureTitle(detail.tab1.active_adventure)}</h2>
      </div>

      <div className="location-tabs">
        <button className={locationView === "world" ? "tab active" : "tab"} type="button" onClick={() => onSetLocationView("world")}>World Map</button>
        <button className={locationView === "adventure" ? "tab active" : "tab"} type="button" onClick={() => onSetLocationView("adventure")}>Adventure Map</button>
        <button className={locationView === "encounter" ? "tab active" : "tab"} type="button" onClick={() => onSetLocationView("encounter")}>Encounter Location</button>
      </div>

      <div className="location-stage">
        {locationView === "world" && (
          <div className="location-map-shell">
            <img className="location-map-image" src={resolveApiUrl(worldMapImageUrl)} alt="Valaska world map" />
            <div className="objective-overlay">
              <strong>Adventure Objectives</strong>
              <ul className="objective-list">
                {(detail.tab1.active_adventure?.objectives ?? []).map((objective) => (
                  <li key={objective.id}>{objective.description}</li>
                ))}
              </ul>
            </div>
          </div>
        )}

        {locationView === "adventure" && detail.tab1.active_adventure && (
          <div className="location-map-shell">
            <img
              className="location-map-image"
              src={resolveApiUrl(detail.tab1.active_adventure.map_image_url)}
              alt={`${displayAdventureTitle(detail.tab1.active_adventure)} adventure map`}
            />
            {adventureLocations.map((location) => (
              <button
                key={location.id}
                type="button"
                className={activeLocation?.id === location.id ? "gm-map-hotspot active" : "gm-map-hotspot"}
                style={{ left: `${location.x_pct}%`, top: `${location.y_pct}%` }}
                onClick={() => onSetActiveLocationId(location.id)}
                aria-label={`Location ${location.number}: ${location.title}`}
              >
                {location.number}
              </button>
            ))}
            {selectedLocation && (
              <div className="travel-popover" style={{ left: `${selectedLocation.x_pct}%`, top: `${selectedLocation.y_pct}%` }}>
                <strong>{selectedLocation.title}</strong>
                <button className="btn btn-small accent" type="button" onClick={onTravelToSelectedLocation} disabled={travelLoading}>
                  {travelLoading ? "Traveling..." : "Travel"}
                </button>
              </div>
            )}
          </div>
        )}

        {locationView === "encounter" && (
          <div className="location-map-shell">
            <img className="location-map-image" src={resolveApiUrl(encounterImageUrl)} alt={encounterLocationTitle} />
          </div>
        )}

        {playerRotationOrder.length > 0 && (
          <div className="player-stack-shell">
            {playerRotationOrder.map((member, index) => {
              const hpLoss = hpLossPercent(member.hp_current, member.hp_max);
              const reversedIndex = playerRotationOrder.length - index - 1;
              return (
                <div
                  key={member.slot}
                  className={[
                    "initiative-card",
                    "initiative-card--player",
                    playerIsOverlayHidden(member.slot) ? "initiative-card--concealed" : "",
                    activeAgentSlot === member.slot ? "active" : "",
                  ].filter(Boolean).join(" ")}
                  style={{
                    left: `${reversedIndex * 10}%`,
                    bottom: `${reversedIndex * 10}%`,
                    zIndex: playerRotationOrder.length - index,
                    borderColor: activeAgentSlot === member.slot ? SLOT_COLORS[member.slot] : "var(--border-strong)",
                  }}
                >
                  <img src={resolveApiUrl(member.portrait_url)} alt={member.player_name} />
                  <div className="initiative-card-overlay" style={{ height: `${hpLoss}%` }} />
                  <div className="initiative-card-meta">
                    <strong>{member.player_name}</strong>
                    <span>{member.class_id}</span>
                    <span>HP {member.hp_current}/{member.hp_max}</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {liveOppositionEntries.length > 0 && (
          <div className={liveOppositionEntries.length > 1 ? "opposition-group-shell" : ""}>
            {liveOppositionEntries.map((entry, index) => (
              <div
                key={`${entry.monsterId}${entry.isDying ? "-dying" : ""}`}
                className={[
                  "initiative-card",
                  "initiative-card--opposition",
                  monsterIsOverlayHidden(entry.monsterId) ? "initiative-card--concealed" : "",
                  activeAgentSlot === OPPOSITION_SLOT && !entry.isDying ? "active" : "",
                  entry.isDying ? "initiative-card--dying" : "",
                ].filter(Boolean).join(" ")}
                style={{
                  borderColor: activeAgentSlot === OPPOSITION_SLOT ? SLOT_COLORS[OPPOSITION_SLOT] : "var(--border-strong)",
                  right: liveOppositionEntries.length > 1 ? `${(liveOppositionEntries.length - index - 1) * 10}%` : undefined,
                  zIndex: liveOppositionEntries.length - index,
                }}
              >
                <img src={entry.imageUrl} alt={entry.displayName} />
                <div className="initiative-card-overlay" style={{ height: `${entry.isDying ? 100 : hpLossPercent(entry.currentHp, entry.hpMax)}%` }} />
                <div className="initiative-card-meta">
                  <strong>{entry.displayName}</strong>
                  <span>{entry.isDying ? "Defeated" : "Opposition"}</span>
                  <span>HP {entry.currentHp}/{entry.hpMax}</span>
                </div>
              </div>
            ))}
          </div>
        )}

        {activeOverlayScene && (
          <div className="combat-overlay-layer">
            {activeOverlayScene.players.map((entry) => (
              <div
                key={`overlay-player-${entry.slot}-${entry.role}`}
                className={[
                  "combat-overlay-card",
                  "combat-overlay-card--player",
                  entry.role === "actor" ? "combat-overlay-card--attack-left" : "",
                  entry.role === "target"
                    ? (entry.defeated ? "combat-overlay-card--dying-left" : (entry.hit ? "combat-overlay-card--hit-left" : "combat-overlay-card--target-left"))
                    : "",
                ].filter(Boolean).join(" ")}
                style={overlayRowStyle(entry.rowIndex, Math.max(activeOverlayScene.players.length, activeOverlayScene.monsters.length))}
              >
                <img src={resolveApiUrl(entry.portraitUrl)} alt={entry.playerName} />
                <div className="initiative-card-overlay" style={{ height: `${hpLossPercent(entry.hpCurrent, entry.hpMax)}%` }} />
                <div className="initiative-card-meta">
                  <strong>{entry.playerName}</strong>
                  <span>{entry.classId}</span>
                  <span>HP {entry.hpCurrent}/{entry.hpMax}</span>
                </div>
              </div>
            ))}

            {activeOverlayScene.monsters.map((entry) => (
              <div
                key={`overlay-monster-${entry.monsterId}-${entry.role}`}
                className={[
                  "combat-overlay-card",
                  "combat-overlay-card--opposition",
                  entry.role === "actor" ? "combat-overlay-card--attack-right" : "",
                  entry.role === "target"
                    ? (entry.defeated ? "combat-overlay-card--dying-right" : (entry.hit ? "combat-overlay-card--hit-right" : "combat-overlay-card--target-right"))
                    : "",
                ].filter(Boolean).join(" ")}
                style={overlayRowStyle(entry.rowIndex, Math.max(activeOverlayScene.players.length, activeOverlayScene.monsters.length))}
              >
                <img src={entry.imageUrl} alt={entry.displayName} />
                <div className="initiative-card-overlay" style={{ height: `${hpLossPercent(entry.hpCurrent, entry.hpMax)}%` }} />
                <div className="initiative-card-meta">
                  <strong>{entry.displayName}</strong>
                  <span>Opposition</span>
                  <span>HP {entry.hpCurrent}/{entry.hpMax}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </article>
  );
}
