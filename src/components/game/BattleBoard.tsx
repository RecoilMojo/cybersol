"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { aiPolicy } from "@/lib/game/ai";
import {
  applyInput,
  boardCount,
  canAttackTarget,
  cloneState,
  createMatch,
  getPlayCost,
  getTauntBlockers,
  hasValidAbilityTargets,
  isValidAbilityTarget,
  onPlayTargetAbility,
} from "@/lib/game/engine";
import { abilityLines, keywordsFromAbilities } from "@/lib/game/abilities";
import { getCardDef } from "@/lib/game/cards";
import {
  HERO_HEALTH,
  HERO_POWER_COST,
  MAX_BOARD,
  MAX_HAND,
  type CardInstance,
  type GameInput,
  type GameState,
} from "@/lib/game/types";

const HAND_WINDOW = 5;

function playHint(desktop: string, touch: string) {
  if (typeof window === "undefined") return desktop;
  return window.matchMedia("(pointer: coarse)").matches ? touch : desktop;
}

function dragThreshold(e: PointerEvent) {
  if (e.pointerType === "touch" || e.pointerType === "pen") return 16;
  if (typeof window !== "undefined" && window.matchMedia("(pointer: coarse)").matches) {
    return 16;
  }
  return 8;
}

function heroHpTone(hp: number): "is-hp-high" | "is-hp-mid" | "is-hp-low" {
  const ratio = hp / HERO_HEALTH;
  if (ratio > 0.66) return "is-hp-high";
  if (ratio > 0.33) return "is-hp-mid";
  return "is-hp-low";
}

function canActivateUnit(state: GameState, boardIndex: number): boolean {
  const c = state.player.board[boardIndex];
  if (!c || c.silenced || !c.canActivate) return false;
  if (
    state.active !== "player" ||
    state.winner ||
    state.pendingTarget ||
    state.pendingGraveyard
  ) {
    return false;
  }
  const def = getCardDef(c.defId);
  if (def.abilities.includes("cast_return_spell")) {
    return (
      state.player.mana >= 2 &&
      state.player.hand.length < MAX_HAND &&
      state.player.graveyard.some((id) => getCardDef(id).kind === "spell")
    );
  }
  if (def.abilities.includes("charge_bounce")) {
    return hasValidAbilityTargets(state, "charge_bounce", "player", c.instanceId);
  }
  return true;
}

function isHandPlayable(state: GameState, handIndex: number): boolean {
  if (
    state.active !== "player" ||
    state.winner ||
    state.pendingTarget ||
    state.pendingGraveyard
  ) {
    return false;
  }
  const c = state.player.hand[handIndex];
  if (!c) return false;
  const def = getCardDef(c.defId);
  const cost = getPlayCost(state.player, def.id);
  if (state.player.mana < cost) return false;
  if (
    def.kind !== "spell" &&
    def.kind !== "equipment" &&
    boardCount(state.player) >= MAX_BOARD
  ) {
    return false;
  }
  const needTarget = onPlayTargetAbility(def.abilities);
  if (
    needTarget &&
    !hasValidAbilityTargets(state, needTarget, "player", c.instanceId)
  ) {
    return false;
  }
  return true;
}

const BLOOD_CRYSTAL_PREVIEW: CardInstance = {
  instanceId: "preview-blood-crystal",
  defId: "blood-crystal",
  attack: 0,
  health: 0,
  maxHealth: 0,
  bonusAttack: 0,
  attacksThisTurn: 0,
  canAttack: false,
  canActivate: false,
  silenced: false,
  keywords: keywordsFromAbilities(["blood_crystal"]),
};
import { getGuestWallet } from "@/lib/guest";
import { config } from "@/lib/config";
import { signP2eRequest } from "@/lib/solana/sign-p2e";
import { AttackLine } from "./AttackLine";
import { CardPreview } from "./CardPreview";
import { CardView } from "./CardView";
import { CombatFx } from "./CombatFx";
import { ManaOrbs } from "./ManaOrbs";
import { TurnHistory } from "./TurnHistory";

type Mode = "free" | "p2e";
type Phase = "lobby" | "playing" | "submitting" | "result";
type Focus = { card: CardInstance; source: "hand" | "board" } | null;

type DragState =
  | {
      kind: "play";
      handIndex: number;
      card: CardInstance;
      x: number;
      y: number;
      ox: number;
      oy: number;
    }
  | {
      kind: "attack";
      attackerIndex: number;
      card: CardInstance;
      x: number;
      y: number;
      ox: number;
      oy: number;
    };

type SubmitResult = {
  status: string;
  winner: string | null;
  turns: number;
  ticketGranted: boolean;
  ticketReason?: string | null;
  ticketsToday: number;
  maxTicketsPerDay: number;
  mode: Mode;
};

type PointerDrag = {
  kind: "play" | "attack";
  index: number;
  pointerId: number;
  startX: number;
  startY: number;
  moved: boolean;
};

export function BattleBoard() {
  const { publicKey, connected, signMessage } = useWallet();
  const solanaWallet = publicKey?.toBase58() ?? "";

  const [mode, setMode] = useState<Mode>("free");
  const [phase, setPhase] = useState<Phase>("lobby");
  const [matchId, setMatchId] = useState<string | null>(null);
  const [playerId, setPlayerId] = useState<string>("");
  const [state, setState] = useState<GameState | null>(null);
  const [inputs, setInputs] = useState<GameInput[]>([]);
  const [selectedAttacker, setSelectedAttacker] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const [result, setResult] = useState<SubmitResult | null>(null);
  const [holdMsg, setHoldMsg] = useState<string | null>(null);
  const [ticketsToday, setTicketsToday] = useState<number | null>(null);
  const [focus, setFocus] = useState<Focus>(null);
  const [drag, setDrag] = useState<DragState | null>(null);
  const [dropHover, setDropHover] = useState<"ally" | "enemy" | "face" | null>(null);
  const [dropSlot, setDropSlot] = useState<number | null>(null);
  const [aiThinking, setAiThinking] = useState(false);
  const [turnBanner, setTurnBanner] = useState<string | null>(null);
  const [aim, setAim] = useState<{
    x1: number;
    y1: number;
    x2: number;
    y2: number;
    mode?: "attack" | "ability";
  } | null>(null);
  const [boardPulse, setBoardPulse] = useState<Record<string, "summon" | "hit">>({});
  const [heroHit, setHeroHit] = useState<{ you: boolean; enemy: boolean }>({
    you: false,
    enemy: false,
  });
  const [handOffset, setHandOffset] = useState(0);
  const [handBrowseId, setHandBrowseId] = useState<string | null>(null);
  const [gyInspect, setGyInspect] = useState<"player" | "ai" | null>(null);
  const [starting, setStarting] = useState(false);
  const prevBoards = useRef<{
    player: (CardInstance | null)[];
    ai: (CardInstance | null)[];
  } | null>(null);
  const prevHeroHp = useRef<{ you: number; enemy: number } | null>(null);
  const prevActive = useRef<"player" | "ai" | null>(null);

  const pointerDrag = useRef<PointerDrag | null>(null);
  const stateRef = useRef(state);
  const inputsRef = useRef(inputs);
  const selectedAttackerRef = useRef<number | null>(null);
  const handOffsetRef = useRef(0);
  const handBrowseIdRef = useRef<string | null>(null);
  const phaseRef = useRef(phase);
  const aiBusy = useRef(false);
  const startingRef = useRef(false);
  const finishLock = useRef(false);
  const matchModeRef = useRef<Mode>("free");
  stateRef.current = state;
  inputsRef.current = inputs;
  selectedAttackerRef.current = selectedAttacker;
  handOffsetRef.current = handOffset;
  handBrowseIdRef.current = handBrowseId;
  phaseRef.current = phase;

  const refreshTickets = useCallback(async (wallet: string) => {
    if (!wallet || wallet.startsWith("guest_")) return;
    const res = await fetch(`/api/tickets?wallet=${wallet}`);
    if (res.ok) {
      const data = await res.json();
      setTicketsToday(data.ticketsToday);
    }
  }, []);

  useEffect(() => {
    if (solanaWallet) void refreshTickets(solanaWallet);
  }, [solanaWallet, refreshTickets]);

  useEffect(() => {
    if (!state || state.winner) {
      prevActive.current = state?.active ?? null;
      return;
    }
    if (prevActive.current && prevActive.current !== state.active) {
      const text = state.active === "player" ? "YOUR TURN" : "ENEMY TURN";
      setTurnBanner(text);
      const t = window.setTimeout(() => setTurnBanner(null), 900);
      prevActive.current = state.active;
      return () => window.clearTimeout(t);
    }
    prevActive.current = state.active;
  }, [state]);

  useEffect(() => {
    if (
      selectedAttacker !== null &&
      state &&
      !state.player.board[selectedAttacker]
    ) {
      setSelectedAttacker(null);
      setAim(null);
    }
  }, [state, selectedAttacker]);

  const prevHandLen = useRef(0);
  useEffect(() => {
    if (!state) {
      setHandOffset(0);
      prevHandLen.current = 0;
      return;
    }
    const len = state.player.hand.length;
    const maxOffset = Math.max(0, len - HAND_WINDOW);
    const grew = len > prevHandLen.current;
    prevHandLen.current = len;
    // New draws / vault tokens — page to the newest cards so they're visible.
    setHandOffset((o) => (grew ? maxOffset : Math.min(o, maxOffset)));
  }, [state?.player.hand.length]);

  useEffect(() => {
    if (!handBrowseId || !state) return;
    if (!state.player.hand.some((c) => c.instanceId === handBrowseId)) {
      setHandBrowseId(null);
    }
  }, [state?.player.hand, handBrowseId]);

  useEffect(() => {
    if (phase === "lobby") setHandOffset(0);
  }, [phase]);

  // Mouse wheel pages a large hand (same as ←/→).
  useEffect(() => {
    if (!state || state.player.hand.length <= HAND_WINDOW) return;
    const onWheel = (e: WheelEvent) => {
      const t = e.target as HTMLElement | null;
      if (!t?.closest?.(".tcg-hand-rail, .tcg-hand")) return;
      e.preventDefault();
      const maxOffset = Math.max(0, state.player.hand.length - HAND_WINDOW);
      const step = e.deltaY > 0 || e.deltaX > 0 ? 1 : -1;
      setHandOffset((o) => Math.max(0, Math.min(maxOffset, o + step)));
    };
    window.addEventListener("wheel", onWheel, { passive: false });
    return () => window.removeEventListener("wheel", onWheel);
  }, [state?.player.hand.length]);

  useEffect(() => {
    if (!state) {
      prevHeroHp.current = null;
      return;
    }
    const prev = prevHeroHp.current;
    prevHeroHp.current = {
      you: state.player.heroHealth,
      enemy: state.ai.heroHealth,
    };
    if (!prev) return;
    const next = {
      you: state.player.heroHealth < prev.you,
      enemy: state.ai.heroHealth < prev.enemy,
    };
    if (!next.you && !next.enemy) return;
    setHeroHit(next);
    const t = window.setTimeout(() => setHeroHit({ you: false, enemy: false }), 380);
    return () => window.clearTimeout(t);
  }, [state]);

  useEffect(() => {
    if (!state) {
      prevBoards.current = null;
      return;
    }
    const prev = prevBoards.current;
    prevBoards.current = {
      player: state.player.board,
      ai: state.ai.board,
    };
    if (!prev) return;

    const oldAll = [...prev.player, ...prev.ai].filter(Boolean);
    const nextPulse: Record<string, "summon" | "hit"> = {};
    for (const c of [...state.player.board, ...state.ai.board]) {
      if (!c) continue;
      const old = oldAll.find((x) => x!.instanceId === c.instanceId);
      if (!old) nextPulse[c.instanceId] = "summon";
      else if (c.health < old.health) nextPulse[c.instanceId] = "hit";
    }
    const ids = Object.keys(nextPulse);
    if (ids.length === 0) return;
    setBoardPulse((p) => ({ ...p, ...nextPulse }));
    const t = window.setTimeout(() => {
      setBoardPulse((p) => {
        const copy = { ...p };
        for (const id of ids) delete copy[id];
        return copy;
      });
    }, 380);
    return () => window.clearTimeout(t);
  }, [state]);

  useEffect(() => {
    if (!solanaWallet || mode !== "p2e") {
      setHoldMsg(
        mode === "p2e" && !solanaWallet
          ? "Connect Phantom / Solflare to enter P2E."
          : null,
      );
      return;
    }
    void fetch(`/api/hold-check?wallet=${solanaWallet}`)
      .then((r) => r.json())
      .then((d) => {
        setHoldMsg(d.eligible ? `Eligible · balance ${d.balance}` : d.reason);
      });
  }, [solanaWallet, mode]);

  const startMatch = useCallback(async () => {
    if (startingRef.current) return;
    startingRef.current = true;
    setStarting(true);
    setError(null);
    setResult(null);
    setHint(null);
    setFocus(null);
    setDrag(null);
    setGyInspect(null);

    let wallet = solanaWallet;
    if (mode === "p2e") {
      if (!connected || !wallet) {
        startingRef.current = false;
        setStarting(false);
        setError("Connect a Solana wallet for P2E mode.");
        return;
      }
    } else {
      wallet = getGuestWallet();
    }

    try {
      const body: Record<string, unknown> = { wallet, mode };
      if (mode === "p2e") {
        setHint("Approve the wallet signature to start P2E…");
        const auth = await signP2eRequest(signMessage, {
          action: "start-match",
          wallet,
        });
        Object.assign(body, auth);
      }
      const res = await fetch("/api/start-match", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to start match");

      const game = createMatch(data.seed);
      finishLock.current = false;
      setMatchId(data.matchId);
      setPlayerId(wallet);
      matchModeRef.current = data.mode === "p2e" ? "p2e" : "free";
      setState(game);
      setInputs([]);
      setSelectedAttacker(null);
      setPhase("playing");
      setHint(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Start failed");
    } finally {
      startingRef.current = false;
      setStarting(false);
    }
  }, [connected, mode, signMessage, solanaWallet]);

  useEffect(() => {
    if (phase !== "lobby") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Enter" || e.metaKey || e.ctrlKey) return;
      if (startingRef.current) return;
      e.preventDefault();
      void startMatch();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [phase, startMatch]);

  const finish = useCallback(
    async (finalInputs: GameInput[], finalState: GameState, wallet: string, id: string) => {
      if (finishLock.current) return;
      finishLock.current = true;
      setPhase("submitting");
      setError(null);
      try {
        const body: Record<string, unknown> = { matchId: id, wallet, inputs: finalInputs };
        if (matchModeRef.current === "p2e") {
          const auth = await signP2eRequest(signMessage, {
            action: "submit-match",
            wallet,
            matchId: id,
          });
          Object.assign(body, auth);
        }
        const res = await fetch("/api/submit-match", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Submit failed");
        setResult(data as SubmitResult);
        setState(finalState);
        setPhase("result");
        void refreshTickets(wallet);
      } catch (e) {
        finishLock.current = false;
        setError(e instanceof Error ? e.message : "Submit failed");
        setState(finalState);
        setPhase("result");
      }
    },
    [refreshTickets, signMessage],
  );

  const returnToLobby = useCallback(() => {
    finishLock.current = false;
    startingRef.current = false;
    setStarting(false);
    setPhase("lobby");
    setState(null);
    setMatchId(null);
    setPlayerId("");
    setResult(null);
    setError(null);
    setHint(null);
    setFocus(null);
    setGyInspect(null);
    setSelectedAttacker(null);
    setAim(null);
    setAiThinking(false);
  }, []);

  const runAiTurnAnimated = useCallback(
    async (current: GameState, finalInputs: GameInput[], wallet: string, id: string) => {
      if (aiBusy.current) return;
      aiBusy.current = true;
      setAiThinking(true);
      const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
      let next = cloneState(current);
      setState(next);
      setHint("Enemy thinking…");
      await sleep(380);

      const moves = aiPolicy(next);
      for (const m of moves) {
        if (next.winner || next.active !== "ai") break;
        applyInput(next, "ai", m);
        next = cloneState(next);
        setState(next);
        await sleep(m.type === "play" ? 420 : m.type === "attack" ? 360 : 220);
      }

      while (
        !next.winner &&
        next.active === "ai" &&
        (next.pendingTarget || next.pendingGraveyard)
      ) {
        if (next.pendingGraveyard) {
          let best = -1;
          let bestCost = -1;
          for (let i = 0; i < next.ai.graveyard.length; i++) {
            const id = next.ai.graveyard[i];
            const kind = getCardDef(id).kind;
            if (next.pendingGraveyard.filter === "spell" && kind !== "spell") {
              continue;
            }
            if (
              next.pendingGraveyard.filter === "character" &&
              (kind === "spell" || kind === "structure" || kind === "equipment")
            ) {
              continue;
            }
            const cost = getCardDef(id).cost;
            if (cost > bestCost) {
              bestCost = cost;
              best = i;
            }
          }
          if (best < 0) applyInput(next, "ai", { type: "cancel_target" });
          else applyInput(next, "ai", { type: "choose_graveyard", index: best });
        } else {
          const pending = next.pendingTarget!;
          const boardSide = pending.anyBoard
            ? pending.ability === "boost_2_2"
              ? "ally"
              : "enemy"
            : pending.allyTarget
              ? "ally"
              : "enemy";
          const board = boardSide === "ally" ? next.ai.board : next.player.board;
          let chosen: "hero" | number | null = null;
          for (let t = 0; t < board.length; t++) {
            if (isValidAbilityTarget(next, pending.ability, "ai", t, boardSide)) {
              chosen = t;
              break;
            }
          }
          if (
            chosen === null &&
            (pending.ability === "damage_thrice" ||
              pending.ability === "damage_twice" ||
              pending.ability === "damage_once")
          ) {
            chosen = "hero";
          }
          if (chosen === null) {
            applyInput(next, "ai", { type: "cancel_target" });
          } else {
            applyInput(next, "ai", {
              type: "choose_target",
              target: chosen,
              board: chosen === "hero" ? undefined : boardSide,
            });
          }
        }
        next = cloneState(next);
        setState(next);
        await sleep(280);
      }

      if (!next.winner && next.active === "ai") {
        applyInput(next, "ai", { type: "end_turn" });
        next = cloneState(next);
        setState(next);
      }

      setHint(null);
      setAiThinking(false);
      aiBusy.current = false;
      if (next.winner) void finish(finalInputs, next, wallet, id);
    },
    [finish],
  );

  const pushInput = useCallback(
    (input: GameInput) => {
      const cur = stateRef.current;
      if (!cur || cur.winner || !matchId || !playerId || aiBusy.current) return;
      if (cur.active !== "player") return;

      if (input.type === "play") {
        const card = cur.player.hand[input.handIndex];
        if (!card) return;
        const def = getCardDef(card.defId);
        const cost = getPlayCost(cur.player, def.id);
        if (cur.player.mana < cost) {
          setHint(`Need ${cost} mana (you have ${cur.player.mana}).`);
          return;
        }
        if (
          def.kind !== "spell" &&
          def.kind !== "equipment" &&
          boardCount(cur.player) >= MAX_BOARD
        ) {
          setHint("Board is full.");
          return;
        }
        const needTarget = onPlayTargetAbility(def.abilities);
        if (
          needTarget &&
          !hasValidAbilityTargets(cur, needTarget, "player", card.instanceId)
        ) {
          setHint("No valid targets for that card.");
          return;
        }
      }

      const next = cloneState(cur);
      const ok = applyInput(next, "player", input);
      if (!ok) {
        setHint("That move is not legal right now.");
        return;
      }

      setHint(
        next.pendingGraveyard
          ? next.pendingGraveyard.filter === "spell"
            ? "Cast: choose a spell from your graveyard."
            : "Dig: choose a fallen character to return."
          : next.pendingTarget
            ? `Choose a target for ${next.pendingTarget.title}.`
            : null,
      );
      const newInputs = [...inputsRef.current, input];
      inputsRef.current = newInputs;
      setInputs(newInputs);
      setSelectedAttacker(null);
      setAim(null);
      setFocus(null);

      if (
        next.active === "player" &&
        (next.pendingTarget || next.pendingGraveyard)
      ) {
        setState(next);
        return;
      }


      if (!next.winner && next.active === "ai") {
        setState(next);
        void runAiTurnAnimated(next, newInputs, playerId, matchId);
      } else {
        setState(next);
        if (next.winner) void finish(newInputs, next, playerId, matchId);
      }
    },
    [finish, matchId, playerId, runAiTurnAnimated],
  );


  const hitDropZone = (x: number, y: number): "ally" | "enemy" | "face" | null => {
    const el = document.elementFromPoint(x, y);
    if (!el) return null;
    if (el.closest("[data-drop='face'], .hero-badge.enemy-hero, .btn-face")) return "face";
    if (el.closest("[data-drop='enemy'], .tcg-board-row.enemy")) return "enemy";
    if (el.closest("[data-drop='ally'], .tcg-board-row.ally")) return "ally";
    return null;
  };

  const enemyIndexAtPoint = (x: number, y: number): number | null => {
    const el = document.elementFromPoint(x, y);
    const cardEl = el?.closest("[data-enemy-index]") as HTMLElement | null;
    if (!cardEl) return null;
    const n = Number(cardEl.dataset.enemyIndex);
    return Number.isFinite(n) ? n : null;
  };

  const allySlotAtPoint = (x: number, y: number): number | null => {
    const el = document.elementFromPoint(x, y);
    const slotEl = el?.closest("[data-slot-index]") as HTMLElement | null;
    if (!slotEl) return null;
    const n = Number(slotEl.dataset.slotIndex);
    return Number.isFinite(n) ? n : null;
  };

  useEffect(() => {
    const cancelSelection = () => {
      if (aiBusy.current) return;
      const cur = stateRef.current;
      if (
        cur &&
        cur.active === "player" &&
        (cur.pendingTarget || cur.pendingGraveyard)
      ) {
        pushInput({ type: "cancel_target" });
        return;
      }
      setGyInspect(null);
      setSelectedAttacker(null);
      setAim(null);
      setDrag(null);
      setDropHover(null);
      setDropSlot(null);
      setHint(null);
      pointerDrag.current = null;
    };

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") cancelSelection();
      if (
        (e.key === "e" || e.key === "E" || e.key === " ") &&
        !e.metaKey &&
        !e.ctrlKey
      ) {
        const cur = stateRef.current;
        if (
          cur &&
          cur.active === "player" &&
          !cur.pendingTarget &&
          !cur.pendingGraveyard &&
          !cur.winner &&
          !aiBusy.current &&
          selectedAttackerRef.current === null &&
          !pointerDrag.current
        ) {
          if (e.key === " ") e.preventDefault();
          setGyInspect(null);
          pushInput({ type: "end_turn" });
        }
      }
      if ((e.key === "h" || e.key === "H") && !e.metaKey && !e.ctrlKey) {
        const cur = stateRef.current;
        if (
          cur &&
          cur.active === "player" &&
          !cur.pendingTarget &&
          !cur.pendingGraveyard &&
          !cur.winner &&
          !aiBusy.current &&
          selectedAttackerRef.current === null &&
          !pointerDrag.current &&
          cur.player.heroPowerReady
        ) {
          setGyInspect(null);
          pushInput({ type: "hero_power" });
        }
      }
      if (
        (e.key === "ArrowLeft" || e.key === "ArrowRight") &&
        !e.metaKey &&
        !e.ctrlKey
      ) {
        const cur = stateRef.current;
        if (!cur || cur.player.hand.length <= HAND_WINDOW) return;
        e.preventDefault();
        const maxOffset = Math.max(0, cur.player.hand.length - HAND_WINDOW);
        const step = e.key === "ArrowRight" ? 1 : -1;
        setHandOffset(
          Math.max(0, Math.min(maxOffset, handOffsetRef.current + step)),
        );
      }
      // 1–5 play the cards currently visible in the hand window.
      if (/^[1-5]$/.test(e.key) && !e.metaKey && !e.ctrlKey && !e.altKey) {
        const cur = stateRef.current;
        if (
          !cur ||
          cur.active !== "player" ||
          cur.winner ||
          cur.pendingTarget ||
          cur.pendingGraveyard ||
          aiBusy.current ||
          selectedAttackerRef.current !== null ||
          pointerDrag.current
        ) {
          return;
        }
        const handIndex = handOffsetRef.current + Number(e.key) - 1;
        if (handIndex < 0 || handIndex >= cur.player.hand.length) return;
        e.preventDefault();
        setGyInspect(null);
        pushInput({ type: "play", handIndex });
      }
      // A — select / cycle ready attackers for click-aim.
      if ((e.key === "a" || e.key === "A") && !e.metaKey && !e.ctrlKey) {
        const cur = stateRef.current;
        if (
          !cur ||
          cur.active !== "player" ||
          cur.winner ||
          cur.pendingTarget ||
          cur.pendingGraveyard ||
          aiBusy.current ||
          pointerDrag.current
        ) {
          return;
        }
        const ready: number[] = [];
        for (let i = 0; i < cur.player.board.length; i++) {
          if (cur.player.board[i]?.canAttack) ready.push(i);
        }
        if (!ready.length) return;
        e.preventDefault();
        setGyInspect(null);
        const curAtk = selectedAttackerRef.current;
        const pos = curAtk === null ? -1 : ready.indexOf(curAtk);
        const nextAtk = ready[(pos + 1) % ready.length]!;
        const unit = cur.player.board[nextAtk]!;
        const el = document.querySelector(
          `[data-instance-id="${unit.instanceId}"]`,
        ) as HTMLElement | null;
        const rect = el?.getBoundingClientRect();
        const x1 = rect ? rect.left + rect.width / 2 : window.innerWidth * 0.5;
        const y1 = rect ? rect.top + rect.height * 0.35 : window.innerHeight * 0.55;
        setSelectedAttacker(nextAtk);
        setAim({
          x1,
          y1,
          x2: x1,
          y2: y1 - 40,
          mode: "attack",
        });
        setHint("Tap a glowing enemy or face · F for face · A cycles attackers");
      }
      // F — attack face while aiming, or pick face for an ability that allows it.
      if ((e.key === "f" || e.key === "F") && !e.metaKey && !e.ctrlKey) {
        const cur = stateRef.current;
        if (
          !cur ||
          cur.active !== "player" ||
          cur.winner ||
          cur.pendingGraveyard ||
          aiBusy.current ||
          pointerDrag.current
        ) {
          return;
        }
        if (cur.pendingTarget?.allowHero) {
          e.preventDefault();
          pushInput({ type: "choose_target", target: "hero" });
          return;
        }
        const atk = selectedAttackerRef.current;
        if (atk === null || cur.pendingTarget) return;
        const unit = cur.player.board[atk];
        if (!unit || !canAttackTarget(unit, cur.ai, "hero")) return;
        e.preventDefault();
        pushInput({ type: "attack", attackerIndex: atk, target: "hero" });
        setSelectedAttacker(null);
        setAim(null);
        setHint(null);
      }
      // Enter — play M-browsed hand card, or confirm sole attack/ability target.
      if (e.key === "Enter" && !e.metaKey && !e.ctrlKey) {
        const cur = stateRef.current;
        if (
          !cur ||
          cur.active !== "player" ||
          cur.winner ||
          cur.pendingGraveyard ||
          aiBusy.current ||
          pointerDrag.current
        ) {
          return;
        }
        if (cur.pendingTarget) {
          const pending = cur.pendingTarget;
          const boards: Array<"ally" | "enemy"> = pending.anyBoard
            ? ["ally", "enemy"]
            : pending.allyTarget
              ? ["ally"]
              : ["enemy"];
          const picks: Array<{
            target: number | "hero";
            board?: "ally" | "enemy";
          }> = [];
          for (const board of boards) {
            const owner = board === "ally" ? cur.player : cur.ai;
            for (let i = 0; i < owner.board.length; i++) {
              if (
                isValidAbilityTarget(
                  cur,
                  pending.ability,
                  "player",
                  i,
                  board,
                )
              ) {
                picks.push({ target: i, board });
              }
            }
          }
          if (pending.allowHero) picks.push({ target: "hero" });
          if (picks.length !== 1) return;
          e.preventDefault();
          const only = picks[0]!;
          pushInput({
            type: "choose_target",
            target: only.target,
            board: only.board,
          });
          return;
        }
        const atk = selectedAttackerRef.current;
        if (atk !== null) {
          const unit = cur.player.board[atk];
          if (!unit) return;
          const picks: Array<number | "hero"> = [];
          for (let i = 0; i < cur.ai.board.length; i++) {
            if (canAttackTarget(unit, cur.ai, i)) picks.push(i);
          }
          if (canAttackTarget(unit, cur.ai, "hero")) picks.push("hero");
          if (picks.length !== 1) return;
          e.preventDefault();
          pushInput({
            type: "attack",
            attackerIndex: atk,
            target: picks[0]!,
          });
          setSelectedAttacker(null);
          setAim(null);
          setHint(null);
          return;
        }
        const browseId = handBrowseIdRef.current;
        if (!browseId) return;
        const handIndex = cur.player.hand.findIndex(
          (c) => c.instanceId === browseId,
        );
        if (handIndex < 0 || !isHandPlayable(cur, handIndex)) return;
        e.preventDefault();
        setGyInspect(null);
        setHandBrowseId(null);
        pushInput({ type: "play", handIndex });
      }
      // R — return to lobby after a finished match.
      if ((e.key === "r" || e.key === "R") && !e.metaKey && !e.ctrlKey) {
        const cur = stateRef.current;
        if (!cur?.winner || phaseRef.current === "submitting") return;
        e.preventDefault();
        returnToLobby();
      }
      // C — activate Cast/Charge when exactly one board unit can.
      if ((e.key === "c" || e.key === "C") && !e.metaKey && !e.ctrlKey) {
        const cur = stateRef.current;
        if (
          !cur ||
          cur.active !== "player" ||
          cur.winner ||
          cur.pendingTarget ||
          cur.pendingGraveyard ||
          aiBusy.current ||
          selectedAttackerRef.current !== null ||
          pointerDrag.current
        ) {
          return;
        }
        const ready: number[] = [];
        for (let i = 0; i < cur.player.board.length; i++) {
          if (canActivateUnit(cur, i)) ready.push(i);
        }
        if (ready.length !== 1) return;
        e.preventDefault();
        setGyInspect(null);
        pushInput({ type: "activate", boardIndex: ready[0]! });
      }
      // M — cycle focus through playable hand cards (pages the window).
      if ((e.key === "m" || e.key === "M") && !e.metaKey && !e.ctrlKey) {
        const cur = stateRef.current;
        if (
          !cur ||
          cur.active !== "player" ||
          cur.winner ||
          cur.pendingTarget ||
          cur.pendingGraveyard ||
          aiBusy.current ||
          selectedAttackerRef.current !== null ||
          pointerDrag.current
        ) {
          return;
        }
        const playable: number[] = [];
        for (let i = 0; i < cur.player.hand.length; i++) {
          if (isHandPlayable(cur, i)) playable.push(i);
        }
        if (!playable.length) {
          setHint("No playable cards right now.");
          return;
        }
        e.preventDefault();
        setGyInspect(null);
        const browseId = handBrowseIdRef.current;
        const curPos = playable.findIndex(
          (i) => cur.player.hand[i]?.instanceId === browseId,
        );
        const nextIdx = playable[(curPos + 1) % playable.length]!;
        const card = cur.player.hand[nextIdx]!;
        const maxOffset = Math.max(0, cur.player.hand.length - HAND_WINDOW);
        const needOffset = Math.min(
          maxOffset,
          Math.max(0, nextIdx - Math.floor(HAND_WINDOW / 2) + 1),
        );
        setHandOffset(needOffset);
        setHandBrowseId(card.instanceId);
        setFocus({ card, source: "hand" });
        setHint(
          `Playable ${playable.indexOf(nextIdx) + 1}/${playable.length}: ${getCardDef(card.defId).name} · Enter to play · ${nextIdx - needOffset + 1} or drag`,
        );
      }
      // G — inspect your GY; Shift+G — enemy GY.
      if ((e.key === "g" || e.key === "G") && !e.metaKey && !e.ctrlKey) {
        const cur = stateRef.current;
        if (
          !cur ||
          cur.pendingTarget ||
          cur.pendingGraveyard ||
          aiBusy.current ||
          selectedAttackerRef.current !== null ||
          pointerDrag.current
        ) {
          return;
        }
        const side = e.shiftKey ? "ai" : "player";
        const pile = side === "ai" ? cur.ai.graveyard : cur.player.graveyard;
        if (!pile.length) return;
        e.preventDefault();
        setSelectedAttacker(null);
        setAim(null);
        setGyInspect((v) => (v === side ? null : side));
      }
    };

    const onContext = (e: MouseEvent) => {
      if (!(e.target as HTMLElement)?.closest?.(".tcg-arena")) return;
      e.preventDefault();
      cancelSelection();
    };

    window.addEventListener("keydown", onKey);
    window.addEventListener("contextmenu", onContext);

    const onMove = (e: PointerEvent) => {
      const d = pointerDrag.current;
      if (!d) return;
      const dx = e.clientX - d.startX;
      const dy = e.clientY - d.startY;
      if (!d.moved && Math.hypot(dx, dy) > dragThreshold(e)) {
        d.moved = true;
        setFocus(null);
        const s = stateRef.current;
        if (!s) return;
        const ox = d.startX;
        const oy = d.startY;
        if (d.kind === "play") {
          const card = s.player.hand[d.index];
          if (card) {
            setDrag({
              kind: "play",
              handIndex: d.index,
              card,
              x: e.clientX,
              y: e.clientY,
              ox,
              oy,
            });
            setHint(
              getCardDef(card.defId).kind === "spell" ||
                getCardDef(card.defId).kind === "equipment"
                ? "Release to cast — then pick a target if needed."
                : "Drop on your board to play.",
            );
          }
        } else {
          const card = s.player.board[d.index];
          if (card) {
            setSelectedAttacker(d.index);
            setDrag({
              kind: "attack",
              attackerIndex: d.index,
              card,
              x: e.clientX,
              y: e.clientY,
              ox,
              oy,
            });
            setHint("Drop on an enemy unit or face to attack.");
          }
        }
      }
      if (d.moved) {
        setDrag((prev) => (prev ? { ...prev, x: e.clientX, y: e.clientY } : prev));
        const zone = hitDropZone(e.clientX, e.clientY);
        setDropHover(zone);
        if (d.kind === "play" && zone === "ally") {
          const slot = allySlotAtPoint(e.clientX, e.clientY);
          setDropSlot(slot);
        } else {
          setDropSlot(null);
        }
      }
    };

    const onUp = (e: PointerEvent) => {
      const d = pointerDrag.current;
      pointerDrag.current = null;
      if (!d) return;

      const s = stateRef.current;
      if (!s) {
        setDrag(null);
        setDropHover(null);
        return;
      }

      if (!d.moved) {
        // Click semantics
        if (d.kind === "play") {
          pushInput({ type: "play", handIndex: d.index });
          setDropSlot(null);
        } else {
          const unit = s.player.board[d.index];
          if (unit?.canAttack) {
            // Second click on the same attacker cancels aim (Esc also works).
            if (selectedAttackerRef.current === d.index) {
              setSelectedAttacker(null);
              setAim(null);
              setHint(null);
            } else {
              setSelectedAttacker(d.index);
              setAim({
                x1: d.startX,
                y1: d.startY,
                x2: e.clientX,
                y2: e.clientY,
                mode: "attack",
              });
              setHint(
                playHint(
                  "Tap a glowing enemy or face · F face · Enter if only one · Esc cancels",
                  "Tap a glowing enemy or face · Cancel to back out",
                ),
              );
            }
          } else if (unit?.canActivate && !unit.silenced) {
            pushInput({ type: "activate", boardIndex: d.index });
          } else {
            setSelectedAttacker(null);
            setAim(null);
          }
        }
        setDrag(null);
        setDropHover(null);
        return;
      }

      const zone = hitDropZone(e.clientX, e.clientY);
      if (d.kind === "play") {
        const handCard = s.player.hand[d.index];
        const offBoard = handCard
          ? getCardDef(handCard.defId).kind === "spell" ||
            getCardDef(handCard.defId).kind === "equipment"
          : false;
        if (zone === "ally" || offBoard) {
          const slot = allySlotAtPoint(e.clientX, e.clientY);
          const boardIndex = !offBoard && slot !== null ? slot : undefined;
          pushInput({ type: "play", handIndex: d.index, boardIndex });
        }
        setDropSlot(null);
      } else if (d.kind === "attack") {
        const attacker = s.player.board[d.index];
        if (attacker) {
          if (zone === "face" && canAttackTarget(attacker, s.ai, "hero")) {
            pushInput({ type: "attack", attackerIndex: d.index, target: "hero" });
          } else {
            const idx = enemyIndexAtPoint(e.clientX, e.clientY);
            if (idx !== null && canAttackTarget(attacker, s.ai, idx)) {
              pushInput({ type: "attack", attackerIndex: d.index, target: idx });
            }
          }
        }
      }

      setDrag(null);
      setDropHover(null);
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("contextmenu", onContext);
    };
  }, [pushInput, returnToLobby]);

  useEffect(() => {
    if (selectedAttacker === null) {
      setAim((prev) => (prev?.mode === "ability" ? prev : null));
      return;
    }
    setFocus(null);
    const onMove = (e: PointerEvent) => {
      setAim((prev) =>
        prev ? { ...prev, x2: e.clientX, y2: e.clientY, mode: "attack" } : prev,
      );
    };
    window.addEventListener("pointermove", onMove);
    return () => window.removeEventListener("pointermove", onMove);
  }, [selectedAttacker]);

  // Unity MouseLineFX — SelectTarget / PlayTarget aim from caster (or spell cast origin).
  useEffect(() => {
    if (!state?.pendingTarget || state.pendingGraveyard) {
      setAim((prev) => (prev?.mode === "ability" ? null : prev));
      return;
    }
    setSelectedAttacker(null);
    setFocus(null);
    const srcId = state.pendingTarget.sourceInstanceId;
    const el = document.querySelector(
      `[data-instance-id="${srcId}"]`,
    ) as HTMLElement | null;
    const hand = document.querySelector(".tcg-hand") as HTMLElement | null;
    const you = document.querySelector(".you-hero") as HTMLElement | null;
    const rect =
      el?.getBoundingClientRect() ??
      hand?.getBoundingClientRect() ??
      you?.getBoundingClientRect();
    const x1 = rect ? rect.left + rect.width / 2 : window.innerWidth * 0.5;
    const y1 = rect ? rect.top + rect.height * 0.35 : window.innerHeight * 0.72;
    setAim({ x1, y1, x2: x1, y2: y1, mode: "ability" });
    const onMove = (e: PointerEvent) => {
      setAim((prev) =>
        prev ? { ...prev, x2: e.clientX, y2: e.clientY, mode: "ability" } : prev,
      );
    };
    window.addEventListener("pointermove", onMove);
    return () => window.removeEventListener("pointermove", onMove);
  }, [state?.pendingTarget?.sourceInstanceId, state?.pendingGraveyard]);

  const beginDrag = (
    kind: "play" | "attack",
    index: number,
    e: React.PointerEvent,
  ) => {
    if (aiBusy.current) return;
    e.preventDefault();
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    pointerDrag.current = {
      kind,
      index,
      pointerId: e.pointerId,
      startX: rect.left + rect.width / 2,
      startY: rect.top + rect.height / 2,
      moved: false,
    };
  };

  const statusLine = useMemo(() => {
    if (!state) return "";
    if (state.winner) return state.winner === "player" ? "Victory" : "Defeat";
    if (state.pendingGraveyard) {
      return state.pendingGraveyard.filter === "spell"
        ? "Cast: choose a spell"
        : "Dig: choose a character";
    }
    if (state.pendingTarget) return `Target: ${state.pendingTarget.title}`;
    if (drag?.kind === "play") return "Dragging to play";
    if (drag?.kind === "attack" || selectedAttacker !== null) return "Choose a target";
    return state.active === "player" ? "Your turn" : "Enemy thinking…";
  }, [state, selectedAttacker, drag]);

  const selectedCard =
    state && selectedAttacker !== null ? state.player.board[selectedAttacker] : null;
  const dragAttacker =
    drag?.kind === "attack" ? drag.card : selectedCard;

  const faceValid =
    Boolean(dragAttacker) &&
    state !== null &&
    canAttackTarget(dragAttacker!, state.ai, "hero") &&
    !state.pendingTarget &&
    !state.pendingGraveyard;

  /** When Enter can auto-confirm, highlight that one target. */
  const soleConfirm = useMemo(() => {
    if (!state || state.active !== "player" || state.winner || drag) return null;
    if (state.pendingGraveyard) return null;
    if (state.pendingTarget) {
      const pending = state.pendingTarget;
      const boards: Array<"ally" | "enemy"> = pending.anyBoard
        ? ["ally", "enemy"]
        : pending.allyTarget
          ? ["ally"]
          : ["enemy"];
      const picks: Array<
        | { kind: "hero" }
        | { kind: "board"; side: "ally" | "enemy"; index: number }
      > = [];
      for (const board of boards) {
        const owner = board === "ally" ? state.player : state.ai;
        for (let i = 0; i < owner.board.length; i++) {
          if (
            isValidAbilityTarget(state, pending.ability, "player", i, board)
          ) {
            picks.push({ kind: "board", side: board, index: i });
          }
        }
      }
      if (pending.allowHero) picks.push({ kind: "hero" });
      return picks.length === 1 ? picks[0]! : null;
    }
    if (selectedAttacker === null || !selectedCard) return null;
    const picks: Array<
      | { kind: "hero" }
      | { kind: "board"; side: "enemy"; index: number }
    > = [];
    for (let i = 0; i < state.ai.board.length; i++) {
      if (canAttackTarget(selectedCard, state.ai, i)) {
        picks.push({ kind: "board", side: "enemy", index: i });
      }
    }
    if (canAttackTarget(selectedCard, state.ai, "hero")) {
      picks.push({ kind: "hero" });
    }
    return picks.length === 1 ? picks[0]! : null;
  }, [state, selectedAttacker, selectedCard, drag]);

  const pillageFace =
    faceValid && Boolean(dragAttacker?.keywords.pillage);

  const heroPowerAffordable =
    Boolean(state) &&
    state!.active === "player" &&
    !state!.winner &&
    !state!.pendingTarget &&
    !state!.pendingGraveyard &&
    state!.player.heroPowerReady &&
    state!.player.mana >= HERO_POWER_COST;

  const soleCastIndex = useMemo(() => {
    if (!state || state.active !== "player" || state.winner || drag) return null;
    if (state.pendingTarget || state.pendingGraveyard || selectedAttacker !== null) {
      return null;
    }
    const ready: number[] = [];
    for (let i = 0; i < state.player.board.length; i++) {
      if (canActivateUnit(state, i)) ready.push(i);
    }
    return ready.length === 1 ? ready[0]! : null;
  }, [state, drag, selectedAttacker]);

  const playableHandCount = useMemo(() => {
    if (!state || state.active !== "player" || state.winner) return 0;
    if (state.pendingTarget || state.pendingGraveyard || selectedAttacker !== null || drag) {
      return 0;
    }
    let n = 0;
    for (let i = 0; i < state.player.hand.length; i++) {
      if (isHandPlayable(state, i)) n += 1;
    }
    return n;
  }, [state, selectedAttacker, drag]);

  const readyAttackCount = useMemo(() => {
    if (!state || state.active !== "player" || state.winner) return 0;
    if (state.pendingTarget || state.pendingGraveyard) return 0;
    return state.player.board.reduce(
      (n, c) => n + (c?.canAttack ? 1 : 0),
      0,
    );
  }, [state]);

  /** Unity end-turn urge when nothing left to do this turn. */
  const endTurnReady = useMemo(() => {
    if (!state || state.active !== "player" || state.winner) {
      return false;
    }
    if (state.pendingTarget || state.pendingGraveyard) return false;
    if (
      state.player.heroPowerReady &&
      state.player.mana >= HERO_POWER_COST &&
      state.player.hand.length < MAX_HAND
    ) {
      return false;
    }
    for (const c of state.player.hand) {
      const def = getCardDef(c.defId);
      const cost = getPlayCost(state.player, def.id);
      if (cost > state.player.mana) continue;
      if (
        def.kind !== "spell" &&
        def.kind !== "equipment" &&
        boardCount(state.player) >= MAX_BOARD
      ) {
        continue;
      }
      const needTarget = onPlayTargetAbility(def.abilities);
      if (
        needTarget &&
        !hasValidAbilityTargets(state, needTarget, "player", c.instanceId)
      ) {
        continue;
      }
      return false;
    }
    for (const c of state.player.board) {
      if (!c) continue;
      if (c.canAttack) return false;
      if (c.canActivate && !c.silenced) {
        // Charge shares canAttack — already handled above.
        // Cast (exhaust:0): only block End Turn urge when it can actually fire.
        if (
          getCardDef(c.defId).abilities.includes("cast_return_spell") &&
          state.player.mana >= 2 &&
          state.player.hand.length < MAX_HAND &&
          state.player.graveyard.some((id) => getCardDef(id).kind === "spell")
        ) {
          return false;
        }
      }
    }
    return true;
  }, [state]);

  const gyCard = (defId: string, i: number): CardInstance => {
    const def = getCardDef(defId);
    return {
      instanceId: `gy-${i}-${defId}`,
      defId,
      attack: def.attack,
      health: def.health,
      maxHealth: def.health,
      bonusAttack: 0,
      attacksThisTurn: 0,
      canAttack: false,
      canActivate: false,
      silenced: false,
      keywords: keywordsFromAbilities(def.abilities),
    };
  };

  useEffect(() => {
    if (state?.pendingTarget || state?.pendingGraveyard) {
      setGyInspect(null);
    }
  }, [state?.pendingTarget, state?.pendingGraveyard]);

  // Keep preview during GY Dig/Cast so you can read what you're returning.
  const suppressHoverPreview =
    Boolean(drag) ||
    selectedAttacker !== null ||
    Boolean(state?.pendingTarget);
  const previewFocus = suppressHoverPreview ? null : focus;

  return (
    <div className="play-shell">
      {phase === "lobby" && (
        <div className="lobby-panel panel panel-glow">
          <p className="lobby-kicker">Solo Battle · Cyber Vamps · Unity rules</p>
          <h2 className="page-title lobby-title">Enter the Arena</h2>
          <p className="page-sub lobby-copy">
            Drag cards to play, drag units to attack. Free play needs no wallet.
            <span className="lobby-copy-more">
              {" "}
              Hold $CYBERSOL for P2E raffle tickets (max {config.maxTicketsPerDay}/day,{" "}
              {config.raffleWinners} daily winners), funded by Pump.fun creator fees. P2E asks your
              wallet to sign so nobody can farm tickets in your name.
            </span>
          </p>
          <p className="lobby-copy-mobile">
            Tap a card to play it. Tap a ready unit to attack. Free play needs no wallet. Hold
            $CYBERSOL for raffle tickets — P2E asks your wallet to sign so nobody farms in your name.
          </p>

          <div className="mode-row">
            <button
              type="button"
              className={`mode-btn ${mode === "free" ? "active-free" : ""}`}
              disabled={starting}
              onClick={() => setMode("free")}
            >
              Free Play
            </button>
            <button
              type="button"
              className={`mode-btn ${mode === "p2e" ? "active-p2e" : ""}`}
              disabled={starting}
              onClick={() => setMode("p2e")}
            >
              <span className="mode-btn-full">P2E · Hold $CYBERSOL</span>
              <span className="mode-btn-short">P2E</span>
            </button>
          </div>

          {mode === "free" && <p className="lobby-status ready">Ready — no wallet required.</p>}
          {mode === "free" && connected && (
            <p className="lobby-tickets">Free play stays guest. Switch to P2E to attach this wallet.</p>
          )}
          {mode === "p2e" && (
            <p className="lobby-status p2e">{holdMsg ?? "Checking $CYBERSOL hold…"}</p>
          )}
          <p className="lobby-tickets">
            {ticketsToday !== null
              ? `Tickets today: ${ticketsToday}/${config.maxTicketsPerDay}`
              : "\u00a0"}
          </p>

          <button
            type="button"
            className="btn-primary lobby-start"
            disabled={starting}
            onClick={() => void startMatch()}
          >
            {starting ? (
              "Starting…"
            ) : (
              <>
                Start Match<span className="kbd-hint"> · Enter</span>
              </>
            )}
          </button>
          {error && <p className="lobby-error">{error}</p>}
        </div>
      )}

      {state && phase !== "lobby" && (
        <div
          className={`tcg-arena ${drag ? "is-dragging" : ""} ${
            drag?.kind === "play" ? "is-play-drag" : ""
          } ${
            drag?.kind === "attack" ||
            (selectedAttacker !== null && !state.pendingTarget)
              ? "is-attack-drag"
              : ""
          } ${pillageFace ? "is-pillage-face" : ""          } ${
            state.pendingGraveyard ? "is-gy-pick" : ""
          } ${gyInspect ? "is-gy-inspect" : ""} ${
            heroPowerAffordable ? "is-hero-power-ready" : ""
          } ${state.active === "ai" || aiThinking ? "is-enemy-turn" : ""}`}
          data-play-kind={
            drag?.kind === "play" ? getCardDef(drag.card.defId).kind : undefined
          }
          data-target-ability={state.pendingTarget?.ability}
          data-shots-left={state.pendingTarget?.shotsLeft ?? undefined}
          data-gy-filter={state.pendingGraveyard?.filter}
          onClick={(e) => {
            if (drag || aiBusy.current) return;
            if (
              selectedAttacker === null &&
              !state.pendingTarget &&
              !state.pendingGraveyard &&
              !gyInspect
            ) {
              return;
            }
            const t = e.target as HTMLElement;
            if (
              t.closest(
                ".tcg-card, .btn-face, .hero-badge, .btn-cast-chip, .btn-secondary, .select-target-banner, .btn-end-turn, .btn-hero-power, .tcg-hand-arrow, .graveyard-picker, .deck-pile--gy",
              )
            ) {
              return;
            }
            if (state.pendingTarget || state.pendingGraveyard) {
              if (state.active !== "player") return;
              pushInput({ type: "cancel_target" });
              return;
            }
            if (gyInspect) {
              setGyInspect(null);
              return;
            }
            setSelectedAttacker(null);
            setAim(null);
            setHint(null);
          }}
        >
          <CombatFx state={state} />
          <CardPreview
            focus={previewFocus}
            manaCost={
              previewFocus?.source === "hand"
                ? getPlayCost(state.player, previewFocus.card.defId)
                : undefined
            }
            currentMana={
              previewFocus?.source === "hand" ? state.player.mana : undefined
            }
          />
          {turnBanner && (
            <div
              className={`turn-banner ${turnBanner.includes("YOUR") ? "is-you" : "is-enemy"}`}
              aria-live="polite"
            >
              {turnBanner}
            </div>
          )}

          {drag?.kind === "play" && (
            <>
              <div className="drag-ghost" style={{ left: drag.x, top: drag.y }}>
                <CardView
                  card={drag.card}
                  size="hand"
                  showCost
                  manaCost={getPlayCost(state.player, drag.card.defId)}
                />
              </div>
              {getCardDef(drag.card.defId).abilities.some(
                (a) => abilityLines([a])[0]?.needsTarget,
              ) && (
                <AttackLine
                  x1={drag.ox}
                  y1={drag.oy}
                  x2={drag.x}
                  y2={drag.y}
                  mode="ability"
                  valid
                />
              )}
            </>
          )}
          {drag?.kind === "attack" && (
            <AttackLine
              x1={drag.ox}
              y1={drag.oy}
              x2={drag.x}
              y2={drag.y}
              mode="attack"
              valid={(() => {
                if (dropHover === "face") return faceValid;
                if (dropHover !== "enemy" || !state) return false;
                const idx = enemyIndexAtPoint(drag.x, drag.y);
                if (idx === null) return true;
                return canAttackTarget(drag.card, state.ai, idx);
              })()}
            />
          )}
          {!drag && aim && (selectedAttacker !== null || aim.mode === "ability") && (
            <AttackLine
              x1={aim.x1}
              y1={aim.y1}
              x2={aim.x2}
              y2={aim.y2}
              mode={aim.mode ?? "attack"}
              valid={
                aim.mode === "ability"
                  ? true
                  : faceValid ||
                    (state?.ai.board.some((_, i) =>
                      selectedCard
                        ? canAttackTarget(selectedCard, state.ai, i)
                        : false,
                    ) ?? false)
              }
            />
          )}

          <div className="tcg-topbar">
            <div className="tcg-turn-box">
              <span className="tcg-turn-label">Turn {state.turn}</span>
              <span className="tcg-turn-status">{statusLine}</span>
            </div>
            <div className="tcg-topbar-right">
              <div className="enemy-resources" aria-label="Enemy mana, deck, and graveyard">
                <ManaOrbs mana={state.ai.mana} maxMana={state.ai.maxMana} compact />
                <div
                  className={`btn-hero-power btn-hero-power--enemy ${
                    state.ai.heroPowerReady && state.active === "ai" ? "is-ready" : "is-spent"
                  }`}
                  aria-label={
                    state.ai.heroPowerReady
                      ? "Enemy Blood Energy ready"
                      : "Enemy Blood Energy spent"
                  }
                >
                  <img
                    className="btn-hero-power-icon"
                    src={
                      state.ai.heroPowerReady
                        ? "/game/ui/icons/cyber-vamp.png"
                        : "/game/ui/icons/cyber-vamp-off.png"
                    }
                    alt=""
                    draggable={false}
                  />
                  <span className="btn-hero-power-cost">{HERO_POWER_COST}</span>
                </div>
                {state.ai.spellDamage > 0 && (
                  <div className="spell-damage-pip" aria-label="Enemy Spell Damage">
                    +{state.ai.spellDamage} SPD
                  </div>
                )}
                <div
                  className={`deck-pile deck-pile--enemy ${
                    state.ai.deck.length === 0
                      ? "is-empty"
                      : state.ai.deck.length <= 3
                        ? "is-low"
                        : ""
                  }`}
                  aria-label={`Enemy deck: ${state.ai.deck.length} cards`}
                >
                  <span className="deck-pile-count">{state.ai.deck.length}</span>
                  <span className="deck-pile-label">Deck</span>
                </div>
                <button
                  type="button"
                  className={`deck-pile deck-pile--enemy deck-pile--gy ${
                    state.ai.graveyard.length ? "has-top" : ""
                  } ${
                    state.pendingGraveyard?.who === "ai" ? "is-picking" : ""
                  } ${gyInspect === "ai" ? "is-inspecting" : ""}`}
                  aria-label="Enemy graveyard — click or Shift+G to inspect"
                  disabled={
                    !state.ai.graveyard.length || Boolean(state.pendingGraveyard)
                  }
                  style={
                    state.ai.graveyard.length
                      ? {
                          ["--gy-art" as string]: `url('${getCardDef(
                            state.ai.graveyard[state.ai.graveyard.length - 1]!,
                          ).art ?? ""}')`,
                        }
                      : undefined
                  }
                  onClick={() => {
                    if (state.pendingGraveyard || drag) return;
                    setSelectedAttacker(null);
                    setAim(null);
                    setGyInspect((v) => (v === "ai" ? null : "ai"));
                  }}
                >
                  <span className="deck-pile-count">{state.ai.graveyard.length}</span>
                  <span className="deck-pile-label">GY</span>
                </button>
              </div>
              <button
                type="button"
                data-drop="face"
                className={[
                  "hero-badge",
                  "enemy-hero",
                  heroHpTone(state.ai.heroHealth),
                  faceValid ||
                  state.pendingTarget?.allowHero ||
                  (drag?.kind === "attack" && dropHover === "face")
                    ? "is-valid-target"
                    : "",
                  soleConfirm?.kind === "hero" ? "is-sole-target" : "",
                  state.ai.heroHealth <= 10 ? "is-critical" : "",
                  heroHit.enemy ? "is-hit" : "",
                  (selectedAttacker !== null || drag?.kind === "attack") &&
                  !faceValid &&
                  !state.pendingTarget
                    ? "is-blocked"
                    : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                onClick={
                  faceValid && selectedAttacker !== null && !drag
                    ? () =>
                        pushInput({
                          type: "attack",
                          attackerIndex: selectedAttacker,
                          target: "hero",
                        })
                    : state.pendingTarget?.allowHero
                      ? () => pushInput({ type: "choose_target", target: "hero" })
                      : (selectedAttacker !== null || drag?.kind === "attack") &&
                          !faceValid
                        ? () =>
                            setHint(
                              "Taunt is blocking face — attack the glowing Taunt unit first (or use Flying).",
                            )
                        : undefined
                }
              >
                <span className="hero-badge-label">Enemy HP</span>
                <span className="hero-badge-hp">{state.ai.heroHealth}</span>
              </button>
            </div>
          </div>

          <div
            className="tcg-enemy-hand"
            aria-label={`Enemy hand: ${state.ai.hand.length} cards`}
            style={
              {
                ["--eh-n" as string]: Math.min(state.ai.hand.length, 12),
              } as CSSProperties
            }
          >
            {Array.from(
              { length: Math.min(state.ai.hand.length, 12) },
              (_, i) => (
                <div
                  key={`enemy-hand-back-${i}`}
                  className="tcg-card-back"
                  style={{ ["--eh-i" as string]: i }}
                  aria-hidden
                />
              ),
            )}
            {state.ai.hand.length > 0 && (
              <span className="tcg-enemy-hand-count" aria-hidden>
                {state.ai.hand.length}
              </span>
            )}
          </div>

          {(faceValid || state.pendingTarget?.allowHero) && (
            <div className="tcg-face-dock" aria-live="polite">
              <button
                type="button"
                className={`btn-face tcg-face-top ${pillageFace ? "is-pillage" : ""}`}
                data-drop="face"
                onClick={() => {
                  if (state.pendingTarget?.allowHero) {
                    pushInput({ type: "choose_target", target: "hero" });
                    return;
                  }
                  if (selectedAttacker !== null) {
                    pushInput({
                      type: "attack",
                      attackerIndex: selectedAttacker,
                      target: "hero",
                    });
                  }
                }}
              >
                {state.pendingTarget?.allowHero ? (
                  <>
                    Target Face<span className="kbd-hint"> · F</span>
                  </>
                ) : pillageFace ? (
                  <>
                    Pillage Face · +2<span className="kbd-hint"> · F</span>
                  </>
                ) : selectedAttacker !== null ? (
                  <>
                    Attack Face<span className="kbd-hint"> · F</span>
                  </>
                ) : (
                  "Attack Face"
                )}
              </button>
            </div>
          )}

          <div
            className={`tcg-board-row enemy ${
              (dropHover === "enemy" && drag?.kind === "attack") ||
              (selectedAttacker !== null && !state.pendingTarget && !drag)
                ? "is-drop-hot"
                : ""
            }`}
            data-drop="enemy"
          >
            {Array.from({ length: MAX_BOARD }, (_, slot) => {
              const c = state.ai.board[slot];
              if (!c) {
                return (
                  <div
                    key={`enemy-slot-${slot}`}
                    className="board-slot-pad"
                    aria-hidden
                  />
                );
              }
              const i = slot;
              const attackValid =
                dragAttacker !== null &&
                !state.pendingTarget &&
                !state.pendingGraveyard &&
                canAttackTarget(dragAttacker, state.ai, i);
              const abilityValid =
                state.pendingTarget !== null &&
                (!state.pendingTarget.allyTarget || Boolean(state.pendingTarget.anyBoard)) &&
                isValidAbilityTarget(
                  state,
                  state.pendingTarget.ability,
                  "player",
                  i,
                  "enemy",
                );
              const enemyProtected =
                getTauntBlockers(state.ai).length > 0 && !c.keywords.taunt;
              const enemyDef = getCardDef(c.defId);
              const enemyIsSite = enemyDef.kind === "structure";
              const enemyHasSpd =
                !c.silenced && enemyDef.abilities.includes("spell_damage");
              return (
                <div
                  key={c.instanceId}
                  className={[
                    "board-slot-filled",
                    enemyIsSite ? "is-site" : "",
                    c.keywords.taunt ? "is-taunt-slot" : "",
                    c.keywords.shield ? "is-shield-slot" : "",
                    c.keywords.flying ? "is-flying-slot" : "",
                    c.equipment ? "is-gear-slot" : "",
                    c.equipment &&
                    c.equipment.health < c.equipment.maxHealth
                      ? "is-gear-worn"
                      : "",
                    enemyProtected ? "is-safe-slot" : "",
                    c.silenced ? "is-silenced-slot" : "",
                    c.keywords.fury ? "is-fury-slot" : "",
                    c.keywords.regen ? "is-regen-slot" : "",
                    c.keywords.deathtouch ? "is-deathtouch-slot" : "",
                    c.keywords.stealth ? "is-stealth-slot" : "",
                    c.keywords.trample ? "is-trample-slot" : "",
                    enemyHasSpd ? "is-spd-slot" : "",
                    soleConfirm?.kind === "board" &&
                    soleConfirm.side === "enemy" &&
                    soleConfirm.index === i
                      ? "is-sole-target"
                      : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  data-enemy-index={i}
                >
                  <CardView
                    card={c}
                    size="board"
                    showCost={false}
                    pulse={boardPulse[c.instanceId] ?? null}
                    protectedByTaunt={enemyProtected}
                    validTarget={attackValid || abilityValid}
                    onHover={
                      suppressHoverPreview
                        ? undefined
                        : (on) => setFocus(on ? { card: c, source: "board" } : null)
                    }
                    onClick={
                      abilityValid
                        ? () =>
                            pushInput({
                              type: "choose_target",
                              target: i,
                              board: "enemy",
                            })
                        : attackValid && selectedAttacker !== null && !drag
                          ? () =>
                              pushInput({
                                type: "attack",
                                attackerIndex: selectedAttacker,
                                target: i,
                              })
                          : undefined
                    }
                  />
                </div>
              );
            })}
          </div>

          <div className="tcg-midline">
            {faceValid || state.pendingTarget?.allowHero ? null : drag?.kind === "play" && drag.card.defId === "blood-crystal" ? (
              <span className="tcg-midline-text is-cast-crystal" role="status">
                Release for +2 mana
              </span>
            ) : drag?.kind === "play" && drag.card.defId === "energy-core" ? (
              <span className="tcg-midline-text is-cast-crystal" role="status">
                Release for +1 mana
              </span>
            ) : drag?.kind === "play" &&
              getCardDef(drag.card.defId).kind === "spell" ? (
              <span className="tcg-midline-text is-cast-spell" role="status">
                Release to cast
              </span>
            ) : drag?.kind === "play" &&
              getCardDef(drag.card.defId).kind === "equipment" ? (
              <span className="tcg-midline-text is-cast-gear" role="status">
                Release to equip
              </span>
            ) : (selectedAttacker !== null || drag?.kind === "attack") &&
              !state.pendingTarget ? (
              <span className="tcg-midline-text is-blocked-face" role="status">
                {getTauntBlockers(state.ai).length > 0
                  ? "Taunt blocks face — hit the glowing Taunt"
                  : "Choose a glowing enemy"}
              </span>
            ) : state.active === "player" &&
              !state.winner &&
              !state.pendingTarget &&
              !state.pendingGraveyard &&
              state.player.board.some((u) => u?.canAttack) ? (
              <span className="tcg-midline-text is-combat-ready" role="status">
                {playHint(
                  `${readyAttackCount} ready · A / drag · F for face`,
                  `${readyAttackCount} ready · tap a glowing unit to attack`,
                )}
              </span>
            ) : heroPowerAffordable ? (
              <span className="tcg-midline-text is-hero-power" role="status">
                {playHint("Blood Energy ready · H", "Blood Energy ready · tap the vamp")}
              </span>
            ) : endTurnReady ? (
              <span className="tcg-midline-text is-end-turn" role="status">
                {playHint("Pass ready · E / Space", "Tap Pass when you're done")}
              </span>
            ) : (
              <span className="tcg-midline-text">Cyber Vamps · Solo Arena</span>
            )}
          </div>

          <div
            className={`tcg-board-row ally ${dropHover === "ally" && drag?.kind === "play" ? "is-drop-hot" : ""}`}
            data-drop="ally"
          >
            {Array.from({ length: MAX_BOARD }, (_, slot) => {
              const c = state.player.board[slot];
              if (!c) {
                const playDrag = drag?.kind === "play";
                const playKind = playDrag
                  ? getCardDef(drag.card.defId).kind
                  : null;
                const needsBoardSlot =
                  playKind !== "spell" && playKind !== "equipment";
                const playHot = playDrag && needsBoardSlot;
                const playHover = playHot && dropSlot === slot;
                return (
                  <div
                    key={`ally-slot-${slot}`}
                    className={`board-slot-pad ${
                      playHot ? "is-hot" : ""
                    } ${playHover ? "is-hot-focus" : ""}`}
                    data-slot-index={slot}
                    aria-hidden
                  />
                );
              }
              const i = slot;
              const allyAbilityValid =
                (state.pendingTarget?.allyTarget === true ||
                  Boolean(state.pendingTarget?.anyBoard)) &&
                isValidAbilityTarget(
                  state,
                  state.pendingTarget!.ability,
                  "player",
                  i,
                  "ally",
                );
              const allyDef = getCardDef(c.defId);
              const canCast = canActivateUnit(state, i);
              const allyProtected =
                getTauntBlockers(state.player).length > 0 && !c.keywords.taunt;
              const allyIsSite = allyDef.kind === "structure";
              const allyHasSpd =
                !c.silenced && allyDef.abilities.includes("spell_damage");
              return (
                <div
                  key={c.instanceId}
                  className={[
                    "board-slot-filled",
                    allyIsSite ? "is-site" : "",
                    c.keywords.taunt ? "is-taunt-slot" : "",
                    c.keywords.shield ? "is-shield-slot" : "",
                    c.keywords.flying ? "is-flying-slot" : "",
                    c.equipment ? "is-gear-slot" : "",
                    c.equipment &&
                    c.equipment.health < c.equipment.maxHealth
                      ? "is-gear-worn"
                      : "",
                    allyProtected ? "is-safe-slot" : "",
                    c.silenced ? "is-silenced-slot" : "",
                    c.keywords.fury ? "is-fury-slot" : "",
                    c.keywords.regen ? "is-regen-slot" : "",
                    c.keywords.deathtouch ? "is-deathtouch-slot" : "",
                    c.keywords.stealth ? "is-stealth-slot" : "",
                    c.keywords.trample ? "is-trample-slot" : "",
                    allyHasSpd ? "is-spd-slot" : "",
                    soleConfirm?.kind === "board" &&
                    soleConfirm.side === "ally" &&
                    soleConfirm.index === i
                      ? "is-sole-target"
                      : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  data-slot-index={slot}
                >
                  <CardView
                    card={c}
                    size="board"
                    showCost={false}
                    pulse={boardPulse[c.instanceId] ?? null}
                    protectedByTaunt={allyProtected}
                    selected={
                      selectedAttacker === i ||
                      (drag?.kind === "attack" && drag.attackerIndex === i)
                    }
                    ready={
                      (c.canAttack &&
                        state.active === "player" &&
                        !state.winner &&
                        !state.pendingTarget &&
                        !state.pendingGraveyard) ||
                      canCast
                    }
                    activateReady={canCast}
                    validTarget={allyAbilityValid}
                    dimmed={
                      (Boolean(
                        state.pendingTarget?.allyTarget || state.pendingTarget?.anyBoard,
                      ) &&
                        !allyAbilityValid) ||
                      (!c.canAttack &&
                        !canCast &&
                        state.active === "player" &&
                        !state.pendingTarget &&
                        !state.pendingGraveyard)
                    }
                    dragging={drag?.kind === "attack" && drag.attackerIndex === i}
                    onHover={
                      suppressHoverPreview
                        ? undefined
                        : (on) => setFocus(on ? { card: c, source: "board" } : null)
                    }
                    onClick={
                      allyAbilityValid
                        ? () =>
                            pushInput({
                              type: "choose_target",
                              target: i,
                              board: "ally",
                            })
                        : undefined
                    }
                    onDragStart={
                      state.active === "player" &&
                      !state.winner &&
                      !state.pendingTarget &&
                      !state.pendingGraveyard &&
                      c.canAttack
                        ? (e) => beginDrag("attack", i, e)
                        : undefined
                    }
                  />
                  {canCast && (
                    <button
                      type="button"
                      className={`btn-cast-chip ${
                        soleCastIndex === i ? "is-sole-cast" : ""
                      }`}
                      aria-label={
                        getCardDef(c.defId).abilities.includes("charge_bounce")
                          ? "Charge: return a character to hand (either board)"
                          : "Cast (2): return a spell from graveyard"
                      }
                      onClick={(e) => {
                        e.stopPropagation();
                        pushInput({ type: "activate", boardIndex: i });
                      }}
                    >
                      {getCardDef(c.defId).abilities.includes("charge_bounce") ? (
                        soleCastIndex === i ? (
                          <>
                            Charge<span className="kbd-hint"> · C</span>
                          </>
                        ) : (
                          "Charge"
                        )
                      ) : soleCastIndex === i ? (
                        <>
                          Cast · 2<span className="kbd-hint"> · C</span>
                        </>
                      ) : (
                        "Cast · 2"
                      )}
                    </button>
                  )}
                  {!canCast &&
                    !allyIsSite &&
                    c.canAttack &&
                    state.active === "player" &&
                    !state.winner &&
                    !state.pendingTarget &&
                    !state.pendingGraveyard &&
                    !drag &&
                    selectedAttacker === null && (
                      <span className="btn-attack-chip" aria-hidden>
                        Atk
                      </span>
                    )}
                </div>
              );
            })}
          </div>

          <div className="tcg-action-rail tcg-action-rail--below" aria-live="polite">
            {state.pendingGraveyard ? (
              <div className="select-target-banner is-gy-pending">
                <strong>{state.pendingGraveyard.title}</strong>
                <span>
                  {state.pendingGraveyard.filter === "spell"
                    ? "Choose a spell in the graveyard panel"
                    : "Choose a fallen character in the graveyard panel"}
                </span>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => pushInput({ type: "cancel_target" })}
                >
                  {state.pendingGraveyard.title === "Cast" ? "Skip Cast" : "Skip Dig"}
                </button>
              </div>
            ) : state.pendingTarget ? (
              <div className="select-target-banner">
                <strong>{state.pendingTarget.title}</strong>
                <span>
                  {state.pendingTarget.shotsLeft && state.pendingTarget.shotsLeft > 1
                    ? `${state.pendingTarget.shotsLeft} separate shots — pick the next target`
                    : state.pendingTarget.shotsLeft === 1 &&
                        (state.pendingTarget.ability === "damage_twice" ||
                          state.pendingTarget.ability === "damage_thrice")
                      ? "Last shot — pick a target"
                      : state.pendingTarget.anyBoard
                    ? state.pendingTarget.ability === "boost_2_2"
                      ? "Select a character to Bless (not this unit)"
                      : state.pendingTarget.ability === "charge_bounce"
                        ? "Select a character to return (not this unit)"
                        : state.pendingTarget.ability === "silence"
                          ? "Select a card to Silence (not this unit)"
                          : `Select a target${
                              state.pendingTarget.allowHero
                                ? " or enemy face · F"
                                : ""
                            }`
                    : state.pendingTarget.allyTarget
                      ? state.pendingTarget.ability === "cyber_bite"
                        ? "Select a friendly character for +3 ATK, Fury, and Taunt"
                        : state.pendingTarget.ability === "fury_taunt"
                          ? "Select a friendly character for Fury and Taunt"
                          : state.pendingTarget.ability === "equip_atk_1"
                            ? "Select a friendly character to equip"
                            : state.pendingTarget.ability === "boost_2_2"
                              ? "Select a friendly character to Bless +2/+2"
                              : "Select a highlighted friendly character"
                      : state.pendingTarget.ability === "destroy_target"
                        ? "Select an enemy card or site to Destroy"
                        : state.pendingTarget.ability === "killer"
                        ? "Select an enemy character with 5+ attack"
                        : state.pendingTarget.ability === "cull"
                          ? "Select an enemy character with 4 or less attack"
                          : state.pendingTarget.ability === "electrify"
                            ? "Select an enemy character to set attack to 1 for one turn"
                            : `Select a highlighted enemy unit${
                                state.pendingTarget.allowHero
                                  ? " or face · F"
                                  : ""
                              }`}
                </span>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => pushInput({ type: "cancel_target" })}
                >
                  Cancel
                </button>
              </div>
            ) : selectedAttacker !== null && !drag ? (
              <div className="select-target-banner is-attack-aim">
                <strong>Attack</strong>
                <span>
                  {playHint(
                    "Pick a glowing enemy or face · F face · Enter if only one · Esc cancels",
                    "Tap a glowing enemy or face · Cancel to back out",
                  )}
                </span>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => {
                    setSelectedAttacker(null);
                    setAim(null);
                    setHint(null);
                  }}
                >
                  Cancel
                </button>
              </div>
            ) : null}
          </div>

          <div className="tcg-board-spacer" aria-hidden />

          <div className="tcg-bottom">
            <div className="tcg-bottom-left">
              <div
                className={[
                  "hero-badge",
                  "you-hero",
                  heroHpTone(state.player.heroHealth),
                  state.player.heroHealth <= 10 ? "is-critical" : "",
                  heroHit.you ? "is-hit" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                aria-label={`Your health ${state.player.heroHealth}`}
              >
                <span className="hero-badge-label">Your HP</span>
                <span className="hero-badge-hp">{state.player.heroHealth}</span>
              </div>
              <ManaOrbs mana={state.player.mana} maxMana={state.player.maxMana} compact />
              {state.player.spellDamage > 0 && (
                <div className="spell-damage-pip" aria-label="Spell Damage">
                  +{state.player.spellDamage} SPD
                </div>
              )}
              <div className="deck-pile" aria-label="Cards in hand">
                <span className="deck-pile-count">{state.player.hand.length}</span>
                <span className="deck-pile-label">Hand</span>
              </div>
              <div
                className={`deck-pile ${
                  state.player.deck.length === 0
                    ? "is-empty"
                    : state.player.deck.length <= 3
                      ? "is-low"
                      : ""
                }`}
                aria-label={`Cards left in deck: ${state.player.deck.length}`}
              >
                <span className="deck-pile-count">{state.player.deck.length}</span>
                <span className="deck-pile-label">Deck</span>
              </div>
              <button
                type="button"
                className={`deck-pile deck-pile--gy ${
                  state.player.graveyard.length ? "has-top" : ""
                } ${
                  state.pendingGraveyard?.who === "player" ? "is-picking" : ""
                } ${gyInspect === "player" ? "is-inspecting" : ""}`}
                aria-label="Graveyard — click or G to inspect"
                disabled={
                  !state.player.graveyard.length ||
                  Boolean(state.pendingGraveyard)
                }
                style={
                  state.player.graveyard.length
                    ? {
                        ["--gy-art" as string]: `url('${getCardDef(
                          state.player.graveyard[state.player.graveyard.length - 1]!,
                        ).art ?? ""}')`,
                      }
                    : undefined
                }
                onClick={() => {
                  if (state.pendingGraveyard || drag) return;
                  setSelectedAttacker(null);
                  setAim(null);
                  setGyInspect((v) => (v === "player" ? null : "player"));
                }}
              >
                <span className="deck-pile-count">{state.player.graveyard.length}</span>
                <span className="deck-pile-label">GY</span>
              </button>
            </div>

            <div className="tcg-hand-rail">
              {state.player.hand.length > HAND_WINDOW && (
                <button
                  type="button"
                  className="tcg-hand-arrow tcg-hand-arrow--prev"
                  disabled={handOffset <= 0}
                  aria-label="Previous hand cards"
                  onClick={() => setHandOffset((o) => Math.max(0, o - 1))}
                >
                  ‹
                </button>
              )}
              <div
                className={`tcg-hand ${
                  state.player.hand.length > HAND_WINDOW ? "is-paged" : ""
                }`}
              >
                {state.player.hand
                  .slice(handOffset, handOffset + HAND_WINDOW)
                  .map((c, localIdx) => {
                    const i = handOffset + localIdx;
                    const def = getCardDef(c.defId);
                    const playCost = getPlayCost(state.player, def.id);
                    const needTarget = onPlayTargetAbility(def.abilities);
                    const noTargets =
                      Boolean(needTarget) &&
                      !hasValidAbilityTargets(
                        state,
                        needTarget!,
                        "player",
                        c.instanceId,
                      );
                    const boardFull =
                      def.kind !== "spell" &&
                      def.kind !== "equipment" &&
                      boardCount(state.player) >= MAX_BOARD;
                    const aimingCombat =
                      selectedAttacker !== null || drag?.kind === "attack";
                    const unaffordable =
                      state.active !== "player" ||
                      Boolean(state.winner) ||
                      Boolean(state.pendingTarget) ||
                      Boolean(state.pendingGraveyard) ||
                      aimingCombat ||
                      aiThinking ||
                      state.player.mana < playCost ||
                      noTargets ||
                      boardFull;
                    const blockReason =
                      aimingCombat ||
                      state.active !== "player" ||
                      Boolean(state.winner) ||
                      Boolean(state.pendingTarget) ||
                      Boolean(state.pendingGraveyard) ||
                      aiThinking
                        ? null
                        : noTargets
                          ? ("no-target" as const)
                          : state.player.mana < playCost
                            ? ("mana" as const)
                            : boardFull
                              ? ("board" as const)
                              : null;
                    return (
                      <CardView
                        key={c.instanceId}
                        card={c}
                        size="hand"
                        manaCost={playCost}
                        dimmed={unaffordable}
                        disabled={unaffordable}
                        blockReason={blockReason}
                        selected={handBrowseId === c.instanceId}
                        dragging={drag?.kind === "play" && drag.handIndex === i}
                        hotkey={String(localIdx + 1)}
                        onHover={
                          suppressHoverPreview
                            ? undefined
                            : (on) =>
                                setFocus(on ? { card: c, source: "hand" } : null)
                        }
                        onDragStart={
                          !unaffordable ? (e) => beginDrag("play", i, e) : undefined
                        }
                      />
                    );
                  })}
              </div>
              {state.player.hand.length > HAND_WINDOW && (
                <button
                  type="button"
                  className="tcg-hand-arrow tcg-hand-arrow--next"
                  disabled={
                    handOffset >= Math.max(0, state.player.hand.length - HAND_WINDOW)
                  }
                  aria-label="Next hand cards"
                  onClick={() =>
                    setHandOffset((o) =>
                      Math.min(
                        Math.max(0, state.player.hand.length - HAND_WINDOW),
                        o + 1,
                      ),
                    )
                  }
                >
                  ›
                </button>
              )}
              {state.player.hand.length > HAND_WINDOW && (
                <span className="tcg-hand-page" aria-live="polite">
                  {handOffset + 1}–
                  {Math.min(handOffset + HAND_WINDOW, state.player.hand.length)} /{" "}
                  {state.player.hand.length}
                </span>
              )}
              {playableHandCount > 0 && (
                <span className="tcg-hand-playable" aria-live="polite">
                  {playableHandCount} playable<span className="kbd-hint"> · M</span>
                </span>
              )}
            </div>

            <div className="tcg-bottom-right">
              <div className="hero-power-wrap">
                <div className="hero-power-preview" aria-hidden>
                  <div className="hero-power-preview-frame">
                    <CardView card={BLOOD_CRYSTAL_PREVIEW} size="hand" showCost />
                  </div>
                  <span className="hero-power-preview-label">Gain Blood Crystal</span>
                  <span className="hero-power-preview-cost">
                    Costs {HERO_POWER_COST} mana
                  </span>
                </div>
                <button
                  type="button"
                  className={`btn-hero-power ${
                    heroPowerAffordable ? "is-ready" : "is-spent"
                  }`}
                  disabled={
                    !state.player.heroPowerReady ||
                    state.active !== "player" ||
                    Boolean(state.winner) ||
                    Boolean(state.pendingTarget) ||
                    Boolean(state.pendingGraveyard) ||
                    aiThinking ||
                    state.player.mana < HERO_POWER_COST
                  }
                  aria-label="Blood Energy (H) — spend 2 mana, gain a Blood Crystal"
                  onClick={() => pushInput({ type: "hero_power" })}
                >
                  <img
                    className="btn-hero-power-icon"
                    src={
                      state.player.heroPowerReady
                        ? "/game/ui/icons/cyber-vamp.png"
                        : "/game/ui/icons/cyber-vamp-off.png"
                    }
                    alt=""
                    draggable={false}
                  />
                  <span className="btn-hero-power-cost">{HERO_POWER_COST}</span>
                  <span className="btn-hero-power-label">Blood Energy</span>
                  {heroPowerAffordable && (
                    <span className="btn-hero-power-ready" aria-hidden>
                      Ready
                    </span>
                  )}
                </button>
              </div>
              <button
                type="button"
                className={`btn-end-turn ${endTurnReady ? "is-ready" : ""}`}
                disabled={
                  phase !== "playing" ||
                  state.active !== "player" ||
                  Boolean(state.winner) ||
                  Boolean(state.pendingTarget) ||
                  Boolean(state.pendingGraveyard) ||
                  selectedAttacker !== null ||
                  Boolean(drag) ||
                  aiThinking
                }
                onClick={() => pushInput({ type: "end_turn" })}
              >
                <span className="btn-end-turn-label">
                  {endTurnReady ? "Pass" : "End Turn"}
                </span>
              </button>
            </div>
          </div>

          <TurnHistory
            history={state.history ?? []}
            hint={[
              hint ??
                playHint(
                  "Drag to play or attack · Esc cancels",
                  "Tap a card to play · tap a unit to attack · tap empty to cancel",
                ),
              playableHandCount > 0 ? `${playableHandCount} playable` : "",
              readyAttackCount > 0 ? `${readyAttackCount} can attack` : "",
              phase === "submitting" ? "Verifying replay…" : "",
              aiThinking ? "Enemy acting…" : "",
              error ?? "",
            ]
              .filter(Boolean)
              .join(" · ")}
          />

          {state.winner && (
            <div className={`match-splash is-${state.winner === "player" ? "win" : "lose"}`}>
              <p className="match-splash-kicker">
                {phase === "submitting" ? "Verifying replay…" : "Match over"}
              </p>
              <h3 className="match-splash-title">
                {state.winner === "player" ? "Victory" : "Defeat"}
              </h3>
              {state.log[state.log.length - 1] && (
                <p className="match-splash-sub match-splash-log">
                  {state.log[state.log.length - 1]}
                </p>
              )}
              {phase === "result" && result && (
                <p className="match-splash-sub">
                  Turns {result.turns}
                  {result.ticketGranted
                    ? ` · Ticket ${result.ticketsToday}/${result.maxTicketsPerDay}`
                    : result.ticketReason
                      ? ` · ${result.ticketReason}`
                      : result.mode === "free"
                        ? " · Free play"
                        : ""}
                </p>
              )}
              {phase === "result" && error && (
                <p className="match-splash-sub match-splash-error">{error}</p>
              )}
              <div className="match-splash-actions">
              <button
                type="button"
                className="btn-primary"
                disabled={phase === "submitting"}
                onClick={returnToLobby}
              >
                {phase === "submitting" ? (
                  "Please wait…"
                ) : (
                  <>
                    Play Again<span className="kbd-hint"> · R</span>
                  </>
                )}
              </button>
              {phase === "result" && error && matchId && playerId && state && (
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() =>
                    void finish(inputsRef.current, state, playerId, matchId)
                  }
                >
                  Retry submit
                </button>
              )}
              </div>
            </div>
          )}

          {(state.pendingGraveyard || gyInspect) && (
            <div
              className="graveyard-overlay"
              role="dialog"
              aria-modal="true"
              aria-label={
                state.pendingGraveyard
                  ? state.pendingGraveyard.title
                  : gyInspect === "ai"
                    ? "Enemy Graveyard"
                    : "Your Graveyard"
              }
              onClick={(e) => {
                if (e.target !== e.currentTarget) return;
                if (state.pendingGraveyard) {
                  if (state.active === "player") {
                    pushInput({ type: "cancel_target" });
                  }
                  return;
                }
                setGyInspect(null);
              }}
            >
              {state.pendingGraveyard ? (
                <div
                  className={`graveyard-picker ${
                    state.pendingGraveyard.filter === "spell" ? "is-cast" : "is-dig"
                  }`}
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="select-target-banner">
                    <strong>{state.pendingGraveyard.title}</strong>
                    <span>
                      {state.pendingGraveyard.filter === "spell"
                        ? playHint(
                            "Click a spell to return it to hand · Esc skips",
                            "Tap a spell to return it · Skip to cancel",
                          )
                        : playHint(
                            "Click a fallen character to return it · Esc skips",
                            "Tap a fallen character to return it · Skip to cancel",
                          )}
                    </span>
                    <button
                      type="button"
                      className="btn-secondary"
                      onClick={() => pushInput({ type: "cancel_target" })}
                    >
                      {state.pendingGraveyard.title === "Cast"
                        ? "Skip Cast"
                        : "Skip Dig"}
                    </button>
                  </div>
                  <div className="graveyard-row">
                    {state.player.graveyard.map((defId, i) => {
                      const kind = getCardDef(defId).kind;
                      if (
                        state.pendingGraveyard?.filter === "spell" &&
                        kind !== "spell"
                      ) {
                        return null;
                      }
                      if (
                        state.pendingGraveyard?.filter === "character" &&
                        (kind === "spell" ||
                          kind === "structure" ||
                          kind === "equipment")
                      ) {
                        return null;
                      }
                      return (
                        <CardView
                          key={`gy-${i}-${defId}`}
                          card={gyCard(defId, i)}
                          size="hand"
                          validTarget
                          onHover={(on) =>
                            setFocus(
                              on
                                ? { card: gyCard(defId, i), source: "hand" }
                                : null,
                            )
                          }
                          onClick={(e) => {
                            e.stopPropagation();
                            pushInput({ type: "choose_graveyard", index: i });
                          }}
                        />
                      );
                    })}
                  </div>
                </div>
              ) : gyInspect ? (
                <div
                  className="graveyard-picker is-inspect"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="select-target-banner">
                    <strong>
                      {gyInspect === "ai" ? "Enemy Graveyard" : "Your Graveyard"}
                    </strong>
                    <span>
                      {(gyInspect === "ai"
                        ? state.ai.graveyard
                        : state.player.graveyard
                      ).length || 0}{" "}
                      cards · {playHint("hover to preview · Esc closes", "tap a card to preview")}
                    </span>
                    <button
                      type="button"
                      className="btn-secondary"
                      onClick={() => setGyInspect(null)}
                    >
                      Close
                    </button>
                  </div>
                  <div className="graveyard-row">
                    {(gyInspect === "ai"
                      ? state.ai.graveyard
                      : state.player.graveyard
                    ).map((defId, i) => (
                      <CardView
                        key={`gy-inspect-${gyInspect}-${i}-${defId}`}
                        card={gyCard(defId, i)}
                        size="hand"
                        onHover={(on) =>
                          setFocus(
                            on
                              ? { card: gyCard(defId, i), source: "hand" }
                              : null,
                          )
                        }
                        onClick={() =>
                          setFocus({ card: gyCard(defId, i), source: "hand" })
                        }
                      />
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
