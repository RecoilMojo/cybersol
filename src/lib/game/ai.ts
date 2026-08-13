import { abilityLines } from "./abilities";
import { getCardDef } from "./cards";
import {
  applyInput,
  boardCount,
  canAttackTarget,
  cloneState,
  getPlayCost,
  hasValidAbilityTargets,
  isManaGem,
  isValidAbilityTarget,
  onPlayTargetAbility,
} from "./engine";
import { HERO_POWER_COST, MAX_BOARD, MAX_HAND, type GameInput, type GameState } from "./types";

const MAX_AI_PLAY_STEPS = 16;
const MAX_CAST_ACTIVATES = 2;

/**
 * Greedy AI: resolve pending targets, play cards, attack with keyword awareness.
 */
export function chooseAiMoves(state: GameState): GameInput[] {
  const sim = cloneState(state);
  const moves: GameInput[] = [];

  const resolvePending = () => {
    while (
      (sim.pendingTarget || sim.pendingGraveyard) &&
      sim.active === "ai" &&
      !sim.winner
    ) {
      if (sim.pendingGraveyard) {
        let best = -1;
        let bestCost = -1;
        for (let i = 0; i < sim.ai.graveyard.length; i++) {
          const id = sim.ai.graveyard[i];
          const kind = getCardDef(id).kind;
          if (sim.pendingGraveyard.filter === "spell" && (kind !== "spell" || isManaGem(id)))
            continue;
          if (
            sim.pendingGraveyard.filter === "character" &&
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
        if (best < 0) {
          const cancel: GameInput = { type: "cancel_target" };
          if (applyInput(sim, "ai", cancel)) moves.push(cancel);
          break;
        }
        const input: GameInput = { type: "choose_graveyard", index: best };
        if (applyInput(sim, "ai", input)) moves.push(input);
        else break;
        continue;
      }
      const pending = sim.pendingTarget!;
      const ability = pending.ability;
      const boardSide = pending.anyBoard
        ? ability === "boost_2_2"
          ? "ally"
          : "enemy"
        : pending.allyTarget
          ? "ally"
          : "enemy";
      const board = boardSide === "ally" ? sim.ai.board : sim.player.board;
      let chosen: "hero" | number | null = null;
      let best = -1;
      const isDamage =
        ability === "damage_thrice" ||
        ability === "damage_twice" ||
        ability === "damage_once";
      if (isDamage) {
        const hits =
          pending.shotsLeft ??
          (ability === "damage_thrice" ? 3 : ability === "damage_twice" ? 2 : 1);
        const faceDmg = (1 + sim.ai.spellDamage) * hits;
        if (
          faceDmg >= sim.player.heroHealth &&
          isValidAbilityTarget(sim, ability, "ai", "hero")
        ) {
          chosen = "hero";
        }
      }
      if (chosen === null) {
        for (let t = 0; t < board.length; t++) {
          if (!isValidAbilityTarget(sim, ability, "ai", t, boardSide)) continue;
          const unit = board[t];
          if (!unit) continue;
          const kw =
            (unit.keywords.taunt ? 4 : 0) +
            (unit.keywords.stealth ? 3 : 0) +
            (unit.keywords.deathtouch ? 5 : 0) +
            (unit.keywords.lifesteal ? 3 : 0) +
            (unit.keywords.fury ? 3 : 0) +
            (unit.keywords.regen ? 2 : 0) +
            (unit.keywords.reaper ? 6 : 0) +
            (unit.keywords.spellImmunity ? 4 : 0) +
            (unit.keywords.shield ? 2 : 0);
          const score =
            ability === "charge_bounce"
              ? unit.attack * 3 + unit.health
              : ability === "silence"
                ? kw * 5 + unit.attack * 2 + unit.health
                : ability === "destroy_target"
                  ? unit.attack * 3 +
                    unit.health +
                    kw +
                    (getCardDef(unit.defId).kind === "structure"
                      ? getCardDef(unit.defId).abilities.includes("cost_aura_1") ||
                        getCardDef(unit.defId).abilities.includes("attack_aura_2") ||
                        getCardDef(unit.defId).abilities.includes("lifesteal_aura")
                        ? 14
                        : 4
                      : 0)
                  : ability === "killer"
                    ? unit.attack * 5 + unit.health + kw
                    : ability === "cull"
                      ? // Prefer softest legal prey (≤4 ATK) so draw lands.
                        40 - unit.attack * 4 + unit.health + kw
                  : ability === "boost_2_2"
                    ? // Bless: buff ready beaters; skip already-blessed soft targets.
                      unit.attack * 2 +
                      unit.health +
                      (unit.canAttack ? 8 : 0) +
                      (unit.attacksThisTurn === 1 && unit.keywords.fury ? 5 : 0) -
                      ((unit.tempDuration ?? 0) > 0 ? 6 : 0)
                    : ability === "cyber_bite" || ability === "fury_taunt"
                      ? unit.attack * 2 +
                        unit.health +
                        (unit.canAttack ? 5 : 0) +
                        (unit.attacksThisTurn === 1 ? 7 : 0)
                      : ability === "equip_atk_1"
                        ? unit.attack * 2 + unit.health + (unit.canAttack ? 6 : 1)
                        : ability === "electrify"
                          ? unit.attack * 4 + kw
                          : isDamage
                            ? (() => {
                                const hits =
                                  pending.shotsLeft ??
                                  (ability === "damage_thrice"
                                    ? 3
                                    : ability === "damage_twice"
                                      ? 2
                                      : 1);
                                const per = 1 + sim.ai.spellDamage;
                                let hp = unit.health;
                                let shielded = unit.keywords.shield;
                                let landed = 0;
                                for (let h = 0; h < hits; h++) {
                                  if (shielded) {
                                    shielded = false;
                                    continue;
                                  }
                                  landed += Math.min(per, Math.max(0, hp));
                                  hp -= per;
                                  if (hp <= 0) break;
                                }
                                return (
                                  unit.attack * 2 +
                                  unit.health +
                                  kw +
                                  landed * 3 +
                                  (hp <= 0 ? 12 : 0) +
                                  (unit.keywords.shield && hits >= 2 ? 5 : 0)
                                );
                              })()
                          : unit.attack * 2 + unit.health;
          if (score > best) {
            best = score;
            chosen = t;
          }
        }
      }
      if (chosen === null && isDamage) {
        chosen = "hero";
      }
      if (chosen === null) {
        const cancel: GameInput = { type: "cancel_target" };
        if (applyInput(sim, "ai", cancel)) moves.push(cancel);
        break;
      }
      const input: GameInput = {
        type: "choose_target",
        target: chosen,
        board: chosen === "hero" ? undefined : boardSide,
      };
      if (applyInput(sim, "ai", input)) moves.push(input);
      else break;
    }
  };

  resolvePending();

  let played = true;
  let playSteps = 0;
  let castActivates = 0;
  while (
    played &&
    playSteps < MAX_AI_PLAY_STEPS &&
    !sim.winner &&
    sim.active === "ai" &&
    !sim.pendingTarget &&
    !sim.pendingGraveyard
  ) {
    played = false;
    playSteps += 1;

    if (
      sim.ai.heroPowerReady &&
      sim.ai.mana >= HERO_POWER_COST &&
      sim.ai.hand.length < MAX_HAND
    ) {
      const affordable = sim.ai.hand.some((c) => {
        const def = getCardDef(c.defId);
        const cost = getPlayCost(sim.ai, def.id);
        if (cost > sim.ai.mana) return false;
        if (
          def.kind !== "spell" &&
          def.kind !== "equipment" &&
          boardCount(sim.ai) >= MAX_BOARD
        ) {
          return false;
        }
        return true;
      });
      if (!affordable || sim.ai.mana >= HERO_POWER_COST + 2) {
        const input: GameInput = { type: "hero_power" };
        if (applyInput(sim, "ai", input)) {
          moves.push(input);
          played = true;
          resolvePending();
          continue;
        }
      }
    }

    for (let i = 0; i < sim.ai.board.length; i++) {
      const c = sim.ai.board[i];
      if (!c || !c.canActivate || c.silenced) continue;
      const def = getCardDef(c.defId);
      if (def.abilities.includes("charge_bounce")) {
        // Unity activate_send_hand + ai_is_enemy — bounce a threat, not a hurt ally.
        if (!hasValidAbilityTargets(sim, "charge_bounce", "ai", c.instanceId)) continue;
        const input: GameInput = { type: "activate", boardIndex: i };
        if (applyInput(sim, "ai", input)) {
          moves.push(input);
          played = true;
          resolvePending();
          break;
        }
        continue;
      }
      if (!def.abilities.includes("cast_return_spell")) continue;
      if (castActivates >= MAX_CAST_ACTIVATES) continue;
      const cast = abilityLines(["cast_return_spell"])[0];
      if (sim.ai.mana < (cast.activateCost ?? 2)) continue;
      if (sim.ai.hand.length >= MAX_HAND) continue;
      // Blood Crystal / Energy Core refund mana — Cast+replay is an infinite loop.
      if (
        !sim.ai.graveyard.some(
          (id) => getCardDef(id).kind === "spell" && !isManaGem(id),
        )
      ) {
        continue;
      }
      const input: GameInput = { type: "activate", boardIndex: i };
      if (applyInput(sim, "ai", input)) {
        moves.push(input);
        played = true;
        castActivates += 1;
        resolvePending();
        break;
      }
    }
    if (played) continue;

    let bestIdx = -1;
    let bestScore = -1;
    for (let i = 0; i < sim.ai.hand.length; i++) {
      const def = getCardDef(sim.ai.hand[i].defId);
      const cost = getPlayCost(sim.ai, def.id);
      if (cost > sim.ai.mana) continue;
      if (
        def.kind !== "spell" &&
        def.kind !== "equipment" &&
        boardCount(sim.ai) >= MAX_BOARD
      ) {
        continue;
      }
      // Skip activated Charge/Cast — only OnPlay target gates (Unity PlayTarget).
      const targetAbility = onPlayTargetAbility(def.abilities);
      if (
        targetAbility &&
        !hasValidAbilityTargets(sim, targetAbility, "ai", sim.ai.hand[i].instanceId)
      ) {
        continue;
      }
      const enemyChars = sim.player.board.filter(
        (c) => !!c && getCardDef(c.defId).kind !== "structure",
      );
      const allyChars = sim.ai.board.filter(
        (c) => !!c && getCardDef(c.defId).kind !== "structure",
      );
      const enemyBoardVal = enemyChars.reduce(
        (s, c) => s + c!.attack * 2 + c!.health,
        0,
      );
      const allyBoardVal = allyChars.reduce(
        (s, c) => s + c!.attack * 2 + c!.health,
        0,
      );
      const wipeGood =
        enemyBoardVal - allyBoardVal >= 4 ||
        (enemyChars.length >= 2 && allyChars.length === 0);
      const bounceGood =
        enemyBoardVal > allyBoardVal + 6 ||
        (sim.ai.hand.length <= 2 && enemyChars.length >= 2);
      // Never hard-cast Armageddon / Crypt into a bad board state.
      if (def.abilities.includes("board_wipe") && !wipeGood) continue;
      if (def.abilities.includes("board_bounce") && !bounceGood) continue;
      const enemyKeywordHeat = enemyChars.reduce((s, c) => {
        const k = c!.keywords;
        return (
          s +
          (k.taunt ? 2 : 0) +
          (k.deathtouch ? 3 : 0) +
          (k.reaper ? 4 : 0) +
          (k.spellImmunity ? 3 : 0) +
          (k.lifesteal ? 2 : 0) +
          (k.fury ? 2 : 0) +
          (k.stealth ? 2 : 0)
        );
      }, 0);
      const digChars = sim.ai.graveyard.filter((id) => {
        const kind = getCardDef(id).kind;
        return kind !== "spell" && kind !== "structure" && kind !== "equipment";
      }).length;
      const score =
        (def.kind === "spell" || def.kind === "equipment"
          ? 6
          : def.kind === "structure"
            ? 4 + def.health
            : def.attack * 2 + def.health) +
        cost +
        def.abilities.length * 2 +
        (def.abilities.includes("spell_damage") ? 3 : 0) +
        (def.abilities.includes("spell_damage") &&
        sim.ai.hand.some((h) => {
          const a = getCardDef(h.defId).abilities;
          return (
            a.includes("damage_thrice") ||
            a.includes("damage_twice") ||
            a.includes("damage_once") ||
            a.includes("fire_aoe2")
          );
        })
          ? 4
          : 0) +
        ((def.abilities.includes("damage_thrice") ||
          def.abilities.includes("damage_twice") ||
          def.abilities.includes("damage_once")) &&
        sim.ai.spellDamage > 0
          ? 3 + sim.ai.spellDamage * 2
          : 0) +
        (def.abilities.includes("spell_charge")
          ? sim.ai.hand.some((h) => getCardDef(h.defId).kind === "spell")
            ? 7
            : 3
          : 0) +
        (def.kind === "spell" &&
        sim.ai.board.some(
          (c) =>
            !!c &&
            !c.silenced &&
            getCardDef(c.defId).abilities.includes("spell_charge"),
        )
          ? 6
          : 0) +
        (def.abilities.includes("haste") ? 4 : 0) +
        (def.abilities.includes("trample") ? 3 : 0) +
        (def.abilities.includes("deathtouch") ? 3 : 0) +
        (def.abilities.includes("taunt") ? 2 : 0) +
        // Unity play_roll_attack — average +3.5 ATK on a 0-printed beater.
        (def.abilities.includes("roll_d6_attack") ? 5 : 0) +
        (def.abilities.includes("attack_aura_2") ? 5 : 0) +
        (def.abilities.includes("lifesteal_aura") ? 5 : 0) +
        (def.abilities.includes("cost_aura_1") ? 4 : 0) +
        (def.abilities.includes("shield") ? 3 : 0) +
        (def.abilities.includes("destroy_target")
          ? sim.player.board.some(
              (c) =>
                !!c &&
                (c.attack >= 4 ||
                  c.health >= 5 ||
                  c.keywords.taunt ||
                  c.keywords.reaper ||
                  c.keywords.spellImmunity ||
                  getCardDef(c.defId).kind === "structure"),
            )
            ? 9
            : 3
          : 0) +
        (def.abilities.includes("reaper") ? 6 : 0) +
        (def.abilities.includes("spell_immunity") ? 4 : 0) +
        // Unity second_bonus Energy Core — spend early for tempo.
        (def.abilities.includes("mana_coin") ? 8 : 0) +
        (def.abilities.includes("blood_crystal") && def.kind === "spell" ? 5 : 0) +
        (def.abilities.includes("cull") &&
        sim.player.board.some((c) => !!c && c.attack <= 4)
          ? 4
          : 0) +
        (def.abilities.includes("killer") &&
        sim.player.board.some((c) => !!c && c.attack >= 5)
          ? 6
          : 0) +
        (def.abilities.includes("electrify") &&
        enemyChars.some((c) => !!c && c.attack >= 4)
          ? 5
          : def.abilities.includes("electrify") && enemyChars.length > 0
            ? 3
            : 0) +
        (def.abilities.includes("board_wipe") ? 12 : 0) +
        (def.abilities.includes("board_bounce") ? 9 : 0) +
        (def.abilities.includes("fire_aoe2")
          ? enemyBoardVal > allyBoardVal
            ? 5
            : 1
          : 0) +
        (def.abilities.includes("silence") && enemyKeywordHeat > 0
          ? 3 + Math.min(6, enemyKeywordHeat)
          : 0) +
        (def.abilities.includes("dig") && digChars > 0 ? 4 + Math.min(4, digChars) : 0) +
        // Buff spells — only when a ready ally can use Fury / Bless / gear.
        ((def.abilities.includes("cyber_bite") ||
          def.abilities.includes("fury_taunt") ||
          def.abilities.includes("boost_2_2") ||
          def.abilities.includes("equip_atk_1")) &&
        allyChars.some((c) => !!c && (c.canAttack || c.attacksThisTurn === 1))
          ? 5
          : 0) +
        (def.abilities.includes("hemo_hand_3")
          ? sim.ai.hand.length <= MAX_HAND - 3
            ? 6
            : sim.ai.hand.length < MAX_HAND
              ? 2
              : -8
          : 0);
      if (score > bestScore) {
        bestScore = score;
        bestIdx = i;
      }
    }
    if (bestIdx >= 0) {
      const def = getCardDef(sim.ai.hand[bestIdx]!.defId);
      let boardIndex: number | undefined;
      if (def.kind !== "spell" && def.kind !== "equipment") {
        // Prefer center-ish empty pads (Unity board spread), then first hole.
        const prefer = [3, 2, 4, 1, 5, 0, 6];
        boardIndex = prefer.find((s) => sim.ai.board[s] == null);
        if (boardIndex === undefined) {
          boardIndex = sim.ai.board.findIndex((c) => c == null);
        }
        if (boardIndex < 0) boardIndex = undefined;
      }
      const input: GameInput = { type: "play", handIndex: bestIdx, boardIndex };
      if (applyInput(sim, "ai", input)) {
        moves.push(input);
        played = true;
        resolvePending();
      }
    }
  }

  for (let i = 0; i < sim.ai.board.length; i++) {
    if (sim.winner || sim.active !== "ai" || sim.pendingTarget || sim.pendingGraveyard)
      break;
    const attacker = sim.ai.board[i];
    if (!attacker?.canAttack) continue;

    // Unity Relic Chalice Intimidate — no counter; chip even when not lethal.
    const intimidate =
      !!attacker.equipment &&
      getCardDef(attacker.equipment.defId).abilities.includes("equip_atk_1");

    let target: "hero" | number = "hero";
    let bestTrade = -1;
    for (let t = 0; t < sim.player.board.length; t++) {
      if (!canAttackTarget(attacker, sim.player, t)) continue;
      const victim = sim.player.board[t];
      if (!victim) continue;
      const kills =
        !victim.keywords.shield &&
        (attacker.attack >= victim.health || attacker.keywords.deathtouch);
      const diesFromRet =
        !intimidate &&
        victim.attack > 0 &&
        victim.attack >= attacker.health &&
        !attacker.keywords.shield;
      // Skip suicide chips unless we also remove the threat.
      if (!kills && diesFromRet) continue;
      // Unity Shell — a single swing never kills through Shield; only Intimidate chips it.
      if (!kills && !intimidate && victim.keywords.shield) continue;
      if (!kills && !intimidate) continue;
      let tradeValue =
        victim.attack * 2 +
        victim.health +
        (victim.keywords.taunt ? 4 : 0) +
        (victim.keywords.deathtouch ? 5 : 0);
      if (kills) tradeValue += 8;
      if (intimidate) tradeValue += 6 + victim.attack;
      if (diesFromRet) tradeValue -= 10;
      // Unity Trample — value excess face poke through soft blockers (Shield eats the hit).
      if (kills && attacker.keywords.trample && !victim.keywords.shield) {
        const excess = Math.max(0, attacker.attack - victim.health);
        tradeValue += excess * 3;
        if (excess >= sim.player.heroHealth) tradeValue += 25;
      }
      if (tradeValue > bestTrade) {
        bestTrade = tradeValue;
        target = t;
      }
    }

    // Unity Flying ignores Taunt — prefer face chip unless a strong board kill exists.
    // Pillage also favors face when the trade is soft.
    const canFace = canAttackTarget(attacker, sim.player, "hero");
    const facePreferred =
      canFace &&
      (attacker.attack >= sim.player.heroHealth ||
        boardCount(sim.player) === 0 ||
        (attacker.keywords.flying && bestTrade < 14) ||
        (attacker.keywords.pillage && bestTrade < 10));

    if (bestTrade < 0 || facePreferred) {
      if (canFace) target = "hero";
      else if (bestTrade < 0) {
        // Forced into taunt — hit first legal
        for (let t = 0; t < sim.player.board.length; t++) {
          if (canAttackTarget(attacker, sim.player, t)) {
            target = t;
            break;
          }
        }
      }
    }

    if (!canAttackTarget(attacker, sim.player, target)) continue;
    const input: GameInput = { type: "attack", attackerIndex: i, target };
    if (applyInput(sim, "ai", input)) {
      moves.push(input);
      i = -1;
    }
  }

  // Never softlock — clear leftover pending before ending the turn.
  resolvePending();
  if (
    (sim.pendingTarget || sim.pendingGraveyard) &&
    sim.active === "ai" &&
    !sim.winner
  ) {
    const cancel: GameInput = { type: "cancel_target" };
    if (applyInput(sim, "ai", cancel)) moves.push(cancel);
  }

  moves.push({ type: "end_turn" });
  return moves;
}

export function aiPolicy(state: GameState): GameInput[] {
  return chooseAiMoves(state).filter((m) => m.type !== "end_turn");
}
