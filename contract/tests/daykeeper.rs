//! Behavioural tests for the parts the product depends on: the auction, the refund, the
//! key handover, the two powers, the ask queue, the donor wall, and every refusal.
//! Native — no wasm, no chain.

use daykeeper::*;
use near_sdk::json_types::U128;
use near_sdk::test_utils::{accounts, VMContextBuilder};
use near_sdk::{testing_env, NearToken};

const GRANT_KEY: &str = "ed25519:8a39GMsevQz3iKhGBcBZwwDPnkLanoETJVYSUqqP3vkq";
const VOICE_KEY: &str = "ed25519:BscdyyC8n9ScYFy6PJoatpZjJfi7CYAeeHmv1LRC85Ea";

const NEAR: u128 = 10u128.pow(24);
const ASK_FEE: u128 = 10u128.pow(22); // 0.01 NEAR, matches ASK_FEE in the contract

fn ctx() -> VMContextBuilder {
    let mut b = VMContextBuilder::new();
    b.current_account_id(accounts(0))
        .predecessor_account_id(accounts(1))
        .signer_account_id(accounts(1))
        .block_timestamp(1_000_000_000);
    b
}

/// `give` is 1 NEAR: the keeper may hand out a fixed 1 NEAR, not a share of the pool.
fn day() -> Daykeeper {
    testing_env!(ctx().build());
    Daykeeper::new(60, U128(NEAR / 10), 1_000, U128(NEAR))
}

fn advance(b: &mut VMContextBuilder, secs: u64) {
    let now = b.context.block_timestamp;
    b.block_timestamp(now + secs * 1_000_000_000);
}

/// Bids as `accounts(1)` (bob) with both keys, then settles as `accounts(2)` (charlie).
fn winner_in_seat() -> (Daykeeper, VMContextBuilder) {
    let mut b = ctx();
    let mut c = day();
    let grant: near_sdk::PublicKey = GRANT_KEY.parse().unwrap();
    let voice: near_sdk::PublicKey = VOICE_KEY.parse().unwrap();

    testing_env!(b.clone().attached_deposit(NearToken::from_yoctonear(5 * NEAR)).build());
    c.donate();

    testing_env!(b.clone().attached_deposit(NearToken::from_yoctonear(NEAR)).build());
    c.bid(Some(grant), Some(voice));

    advance(&mut b, 61);
    testing_env!(b.clone().predecessor_account_id(accounts(2)).build());
    c.settle();
    (c, b)
}

#[test]
fn settle_installs_both_keys_on_the_winner() {
    let (c, _b) = winner_in_seat();
    let s = c.get_state();
    assert_eq!(s.keeper, Some(accounts(1)));
    assert_eq!(s.grant_key, Some(GRANT_KEY.parse().unwrap()));
    assert_eq!(s.voice_key, Some(VOICE_KEY.parse().unwrap()));
    assert_eq!(s.keeper_grants_left, 1);
    assert_eq!(s.keepers, 1);
}

#[test]
fn being_outbid_returns_the_money_to_the_pool_ledger() {
    let mut b = ctx();
    let mut c = day();
    let grant: near_sdk::PublicKey = GRANT_KEY.parse().unwrap();

    testing_env!(b.clone().attached_deposit(NearToken::from_yoctonear(NEAR)).build());
    c.bid(Some(grant), None);
    assert_eq!(c.get_state().pool_yocto.0, NEAR);

    // a second bidder at 2 NEAR: the first bid is refunded, so the pool holds 2, not 3
    testing_env!(b
        .clone()
        .predecessor_account_id(accounts(2))
        .signer_account_id(accounts(2))
        .attached_deposit(NearToken::from_yoctonear(2 * NEAR))
        .build());
    c.bid(None, None);
    assert_eq!(c.get_state().pool_yocto.0, 2 * NEAR);
    assert_eq!(c.get_state().high_bidder, Some(accounts(2)));
}

/// The economics: the keeper can hand out more than they paid. That is the reason to bid.
#[test]
fn the_grant_is_the_launch_size_not_a_share_of_the_pool() {
    let (c, _b) = winner_in_seat();
    let s = c.get_state();
    assert_eq!(s.give_yocto.0, NEAR);
    assert_eq!(s.grant_cap_yocto.0, NEAR, "6 NEAR pool, 1 NEAR give → the whole give");
    assert!(s.grant_cap_yocto.0 > s.high_bid_yocto.0, "the keeper can give more than they paid");
}

#[test]
fn the_grant_never_exceeds_the_pool() {
    let mut b = ctx();
    let mut c = day();
    testing_env!(b.clone().attached_deposit(NearToken::from_yoctonear(NEAR / 2)).build());
    c.donate();
    assert_eq!(c.get_state().grant_cap_yocto.0, NEAR / 2, "small pool limits the grant");
}

#[test]
fn the_grant_key_moves_exactly_the_cap_and_only_once() {
    let (mut c, b) = winner_in_seat();
    let cap = c.get_state().grant_cap_yocto.0;
    let pool_before = c.get_state().pool_yocto.0;

    let mut keeper_ctx = b.clone();
    keeper_ctx
        .signer_account_pk(GRANT_KEY.parse().unwrap())
        .predecessor_account_id(accounts(0));
    testing_env!(keeper_ctx.clone().build());
    c.grant(None, accounts(3), "for the bus fare".to_string());

    let s = c.get_state();
    assert_eq!(s.pool_yocto.0, pool_before - cap);
    assert_eq!(s.grants, 1);
    assert_eq!(s.keeper_grants_left, 0);
    assert_eq!(c.get_grants().len(), 1);
}

#[test]
#[should_panic(expected = "this round's grant is already spent")]
fn a_second_grant_in_the_same_round_is_refused() {
    let (mut c, b) = winner_in_seat();
    let mut k = b.clone();
    k.signer_account_pk(GRANT_KEY.parse().unwrap()).predecessor_account_id(accounts(0));
    testing_env!(k.clone().build());
    c.grant(None, accounts(3), "first".to_string());
    testing_env!(k.build());
    c.grant(None, accounts(3), "second".to_string());
}

#[test]
#[should_panic(expected = "the keeper cannot name themselves")]
fn the_keeper_cannot_grant_to_themselves() {
    let (mut c, b) = winner_in_seat();
    let mut k = b.clone();
    k.signer_account_pk(GRANT_KEY.parse().unwrap()).predecessor_account_id(accounts(0));
    testing_env!(k.build());
    // the keeper is accounts(1); paying themselves is the obvious abuse
    c.grant(None, accounts(1), "to me".to_string());
}

#[test]
#[should_panic(expected = "only the keeper's grant key may grant")]
fn the_voice_key_cannot_grant() {
    let (mut c, b) = winner_in_seat();
    let mut k = b.clone();
    k.signer_account_pk(VOICE_KEY.parse().unwrap()).predecessor_account_id(accounts(0));
    testing_env!(k.build());
    c.grant(None, accounts(3), "no".to_string());
}

#[test]
#[should_panic(expected = "only the keeper's voice key may speak")]
fn the_grant_key_cannot_speak() {
    let (mut c, b) = winner_in_seat();
    let mut k = b.clone();
    k.signer_account_pk(GRANT_KEY.parse().unwrap()).predecessor_account_id(accounts(0));
    testing_env!(k.build());
    c.say("no".to_string());
}

#[test]
fn the_voice_key_speaks() {
    let (mut c, b) = winner_in_seat();
    let mut k = b.clone();
    k.signer_account_pk(VOICE_KEY.parse().unwrap()).predecessor_account_id(accounts(0));
    testing_env!(k.build());
    c.say("the treasury is speaking".to_string());
    assert_eq!(c.get_voices().len(), 1);
    assert_eq!(c.get_state().voices, 1);
}

#[test]
#[should_panic(expected = "the keeper's day is over")]
fn the_key_dies_at_the_deadline_without_anyone_revoking_it() {
    let (mut c, mut b) = winner_in_seat();
    advance(&mut b, 61);
    b.signer_account_pk(GRANT_KEY.parse().unwrap()).predecessor_account_id(accounts(0));
    testing_env!(b.build());
    c.grant(None, accounts(3), "too late".to_string());
}

#[test]
#[should_panic(expected = "bidding is closed")]
fn bidding_closes_when_the_round_ends() {
    let mut b = ctx();
    let mut c = day();
    advance(&mut b, 61);
    testing_env!(b.attached_deposit(NearToken::from_yoctonear(NEAR)).build());
    c.bid(None, None);
}

#[test]
#[should_panic(expected = "bid below the floor")]
fn a_bid_under_the_floor_is_refused() {
    let mut b = ctx();
    let mut c = day();
    testing_env!(b.attached_deposit(NearToken::from_yoctonear(1)).build());
    c.bid(None, None);
}

// ---- the ask queue -------------------------------------------------------

#[test]
fn posting_an_ask_costs_a_fee_that_goes_into_the_pool() {
    let mut b = ctx();
    let mut c = day();
    testing_env!(b
        .clone()
        .predecessor_account_id(accounts(3))
        .attached_deposit(NearToken::from_yoctonear(ASK_FEE))
        .build());
    let id = c.request("a new laptop for school".to_string(), U128(NEAR));

    assert_eq!(id, 1);
    let s = c.get_state();
    assert_eq!(s.asks, 1);
    assert_eq!(s.open_asks, 1);
    assert_eq!(s.pool_yocto.0, ASK_FEE, "the fee is a donation to the pool it asks");
    assert_eq!(c.get_asks()[0].asker, accounts(3));
}

#[test]
#[should_panic(expected = "posting an ask costs")]
fn an_ask_without_the_fee_is_refused() {
    let mut b = ctx();
    let mut c = day();
    testing_env!(b.attached_deposit(NearToken::from_yoctonear(1)).build());
    c.request("free money please".to_string(), U128(NEAR));
}

#[test]
fn the_keeper_can_answer_an_ask_and_the_grant_records_it() {
    let (mut c, b) = winner_in_seat();

    // accounts(3) posts an ask
    let mut ask_ctx = b.clone();
    ask_ctx
        .predecessor_account_id(accounts(3))
        .attached_deposit(NearToken::from_yoctonear(ASK_FEE));
    testing_env!(ask_ctx.build());
    let id = c.request("bus fare to the interview".to_string(), U128(NEAR / 2));

    let mut k = b.clone();
    k.signer_account_pk(GRANT_KEY.parse().unwrap())
        .predecessor_account_id(accounts(0))
        .attached_deposit(NearToken::from_yoctonear(0));
    testing_env!(k.build());
    c.grant(Some(id), accounts(3), "funded, good luck".to_string());

    let grants = c.get_grants();
    assert_eq!(grants[0].ask_id, Some(id));
    assert_eq!(grants[0].recipient, accounts(3));
    let asks = c.get_asks();
    assert_eq!(asks[0].funded_by, Some(accounts(1)));
    assert_eq!(c.get_state().open_asks, 0);
}

#[test]
#[should_panic(expected = "fund the ask by paying the account that asked")]
fn an_ask_cannot_be_answered_by_paying_somebody_else() {
    let (mut c, b) = winner_in_seat();
    let mut ask_ctx = b.clone();
    ask_ctx
        .predecessor_account_id(accounts(3))
        .attached_deposit(NearToken::from_yoctonear(ASK_FEE));
    testing_env!(ask_ctx.build());
    let id = c.request("for me".to_string(), U128(NEAR / 2));

    let mut k = b.clone();
    k.signer_account_pk(GRANT_KEY.parse().unwrap()).predecessor_account_id(accounts(0));
    testing_env!(k.build());
    // answering ask #1 but paying accounts(4): the record would lie, so it is refused
    c.grant(Some(id), accounts(4), "not the asker".to_string());
}

// ---- the donor wall ------------------------------------------------------

#[test]
fn donations_accumulate_per_donor() {
    let mut b = ctx();
    let mut c = day();
    testing_env!(b.clone().attached_deposit(NearToken::from_yoctonear(NEAR)).build());
    c.donate();
    testing_env!(b.clone().attached_deposit(NearToken::from_yoctonear(2 * NEAR)).build());
    c.donate();

    testing_env!(b
        .clone()
        .predecessor_account_id(accounts(4))
        .attached_deposit(NearToken::from_yoctonear(NEAR / 2))
        .build());
    c.donate();

    let donors = c.get_donors();
    assert_eq!(donors.len(), 2, "one row per donor, not per donation");
    assert_eq!(donors[0].account, accounts(1));
    assert_eq!(donors[0].total_yocto.0, 3 * NEAR, "largest first");
    assert_eq!(donors[1].total_yocto.0, NEAR / 2);
    assert_eq!(c.get_state().donors, 2);
}
