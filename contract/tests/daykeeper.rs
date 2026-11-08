//! Behavioural tests for the parts the product depends on: the auction, the refund, the
//! key handover, the two powers, and every refusal. Native — no wasm, no chain.

use daykeeper::*;
use near_sdk::json_types::U128;
use near_sdk::test_utils::{accounts, VMContextBuilder};
use near_sdk::{testing_env, NearToken};

const GRANT_KEY: &str = "ed25519:8a39GMsevQz3iKhGBcBZwwDPnkLanoETJVYSUqqP3vkq";
const VOICE_KEY: &str = "ed25519:BscdyyC8n9ScYFy6PJoatpZjJfi7CYAeeHmv1LRC85Ea";

fn ctx() -> VMContextBuilder {
    let mut b = VMContextBuilder::new();
    b.current_account_id(accounts(0))
        .predecessor_account_id(accounts(1))
        .signer_account_id(accounts(1))
        .block_timestamp(1_000_000_000);
    b
}

fn day() -> Daykeeper {
    testing_env!(ctx().build());
    Daykeeper::new(60, U128(10u128.pow(24)), 1_000, 500)
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

    testing_env!(b.clone().attached_deposit(NearToken::from_yoctonear(5 * 10u128.pow(24))).build());
    c.donate();

    testing_env!(b.clone().attached_deposit(NearToken::from_yoctonear(10u128.pow(24))).build());
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

    testing_env!(b.clone().attached_deposit(NearToken::from_yoctonear(10u128.pow(24))).build());
    c.bid(Some(grant), None);
    assert_eq!(c.get_state().pool_yocto.0, 10u128.pow(24));

    // a second bidder at 2 NEAR: the first bid is refunded, so the pool holds 2, not 3
    testing_env!(b
        .clone()
        .predecessor_account_id(accounts(2))
        .signer_account_id(accounts(2))
        .attached_deposit(NearToken::from_yoctonear(2 * 10u128.pow(24)))
        .build());
    c.bid(None, None);
    assert_eq!(c.get_state().pool_yocto.0, 2 * 10u128.pow(24));
    assert_eq!(c.get_state().high_bidder, Some(accounts(2)));
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
    c.grant(accounts(3), "for the bus fare".to_string());

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
    c.grant(accounts(3), "first".to_string());
    testing_env!(k.build());
    c.grant(accounts(3), "second".to_string());
}

#[test]
#[should_panic(expected = "only the keeper's grant key may grant")]
fn the_voice_key_cannot_grant() {
    let (mut c, b) = winner_in_seat();
    let mut k = b.clone();
    k.signer_account_pk(VOICE_KEY.parse().unwrap()).predecessor_account_id(accounts(0));
    testing_env!(k.build());
    c.grant(accounts(3), "no".to_string());
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
    c.grant(accounts(3), "too late".to_string());
}

#[test]
#[should_panic(expected = "bidding is closed")]
fn bidding_closes_when_the_round_ends() {
    let mut b = ctx();
    let mut c = day();
    advance(&mut b, 61);
    testing_env!(b.attached_deposit(NearToken::from_yoctonear(10u128.pow(24))).build());
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
