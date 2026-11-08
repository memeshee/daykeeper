//! Daykeeper — a public treasury whose daily Keeper is chosen by continuous auction,
//! and whose power arrives as two scoped NEAR access keys that the contract can revoke.
//!
//! The whole mechanic lives here, in the contract. There is no admin key, no setter for
//! the round length, the price step, the grant size or the voice scope, and no scheduler:
//! a Keeper's power expires because every privileged method re-checks `block_timestamp`
//! against `round_end`.
//!
//! The two keys a Keeper receives:
//!   * the GRANT key — receiver = this contract, methods = `grant` → one grant, this big
//!   * the VOICE key — receiver = this contract, methods = `say`   → speak as the treasury
//!
//! A function-call key cannot attach NEAR, so neither key can move the pool. Only `grant`
//! moves money, only once per round, only up to `give` (fixed at launch), and only to
//! somebody other than the keeper.
//!
//! The pool funds **asks**: anyone may post one for a fee that itself goes into the pool,
//! and the keeper answers one per round. The grant records which ask it answered.

use near_sdk::json_types::U128;
use near_sdk::store::IterableMap;
use near_sdk::{env, near, require, AccountId, NearToken, Promise, PublicKey};

/// Gas allowance handed to each Keeper key. A grant costs a transfer promise plus state
/// writes (tens of Tgas), so 0.25 NEAR leaves generous headroom and is refunded to the
/// treasury when the key is deleted at the end of the day.
const KEEPER_KEY_ALLOWANCE: NearToken = NearToken::from_millinear(250);

/// Posting an ask costs a small fee, and the fee goes into the pool: the queue funds the
/// treasury it is asking. Storage for one ask is well under this.
const ASK_FEE: NearToken = NearToken::from_millinear(10);

/// Maximum history entries kept on chain, so views stay cheap forever.
const MAX_HISTORY: u32 = 500;

#[near(serializers = [json, borsh])]
#[derive(Clone)]
pub struct KeeperRecord {
    pub account: AccountId,
    pub paid_yocto: U128,
    pub round: u64,
    pub since_ns: u64,
    pub grants_made: u32,
    pub words_spoken: u32,
}

#[near(serializers = [json, borsh])]
#[derive(Clone)]
pub struct GrantRecord {
    pub keeper: AccountId,
    pub recipient: AccountId,
    pub amount_yocto: U128,
    pub memo: String,
    pub at_ns: u64,
    /// The ask this grant answered, when the keeper answered one.
    pub ask_id: Option<u64>,
}

#[near(serializers = [json, borsh])]
#[derive(Clone)]
pub struct VoiceRecord {
    pub keeper: AccountId,
    pub text: String,
    pub at_ns: u64,
    pub round: u64,
}

#[near(serializers = [json, borsh])]
#[derive(Clone)]
pub struct AskRecord {
    pub id: u64,
    pub asker: AccountId,
    pub text: String,
    pub want_yocto: U128,
    pub at_ns: u64,
    pub round: u64,
    pub funded_by: Option<AccountId>,
}

#[near(serializers = [json, borsh])]
#[derive(Clone)]
pub struct DonorRecord {
    pub account: AccountId,
    pub total_yocto: U128,
}

#[near(serializers = [json, borsh])]
pub struct StateView {
    pub treasury: AccountId,
    pub pool_yocto: U128,
    pub round: u64,
    pub round_end_ns: u64,
    pub now_ns: u64,
    pub price_floor_yocto: U128,
    pub next_min_bid_yocto: U128,
    pub high_bid_yocto: U128,
    pub high_bidder: Option<AccountId>,
    /// True while a round has ended and nobody has rung the bell yet.
    pub awaiting_settle: bool,
    pub keeper: Option<AccountId>,
    pub grant_key: Option<PublicKey>,
    pub voice_key: Option<PublicKey>,
    pub keeper_grants_left: u32,
    /// The most a keeper can give away today: min(give, pool).
    pub grant_cap_yocto: U128,
    /// The absolute grant size fixed at launch.
    pub give_yocto: U128,
    pub round_secs: u64,
    pub step_bps: u16,
    pub keepers: u32,
    pub grants: u32,
    pub voices: u32,
    pub asks: u32,
    pub open_asks: u32,
    pub donors: u32,
}

#[near(contract_state)]
pub struct Daykeeper {
    treasury: AccountId,
    pool: u128,
    round: u64,
    round_end_ns: u64,
    round_secs: u64,
    price_floor: u128,
    step_bps: u16,
    give: u128,
    high_bid: u128,
    high_bidder: Option<AccountId>,
    high_grant_key: Option<PublicKey>,
    high_voice_key: Option<PublicKey>,
    keeper: Option<AccountId>,
    grant_key: Option<PublicKey>,
    voice_key: Option<PublicKey>,
    keeper_grants_left: u32,
    keepers: IterableMap<u64, KeeperRecord>,
    keeper_count: u32,
    grants: IterableMap<u64, GrantRecord>,
    grant_count: u32,
    voices: IterableMap<u64, VoiceRecord>,
    voice_count: u32,
    asks: IterableMap<u64, AskRecord>,
    ask_count: u32,
    next_ask_id: u64,
    donors: IterableMap<AccountId, u128>,
    donor_count: u32,
}

/// `#[near(contract_state)]` requires `Default`, and an uninitialised contract would
/// otherwise silently serve default state. Panicking here means any call before `new()`
/// fails loudly instead of pretending the treasury exists.
impl Default for Daykeeper {
    fn default() -> Self {
        env::panic_str("Daykeeper is not initialised: call new() first")
    }
}

#[near]
impl Daykeeper {
    /// Parameters are fixed here, at launch, and there is no method that can change them.
    ///
    /// `give_yocto` is an absolute grant size, not a share of the pool. That is what makes
    /// bidding rational: bidding 0.2 for the right to hand out 1.0 is a reason, bidding 0.2
    /// for the right to hand out 0.05 is not.
    #[init]
    pub fn new(round_secs: u64, price_floor_yocto: U128, step_bps: u16, give_yocto: U128) -> Self {
        require!(round_secs >= 5, "round must last at least 5 seconds");
        require!(step_bps > 0 && step_bps <= 10_000, "step_bps out of range");
        require!(give_yocto.0 > 0, "the grant size must be positive");
        let now = env::block_timestamp();
        Self {
            treasury: env::current_account_id(),
            pool: 0,
            round: 1,
            round_end_ns: now + round_secs * 1_000_000_000,
            round_secs,
            price_floor: price_floor_yocto.0,
            step_bps,
            give: give_yocto.0,
            high_bid: 0,
            high_bidder: None,
            high_grant_key: None,
            high_voice_key: None,
            keeper: None,
            grant_key: None,
            voice_key: None,
            keeper_grants_left: 0,
            keepers: IterableMap::new(b"k"),
            keeper_count: 0,
            grants: IterableMap::new(b"g"),
            grant_count: 0,
            voices: IterableMap::new(b"v"),
            voice_count: 0,
            asks: IterableMap::new(b"a"),
            ask_count: 0,
            next_ask_id: 1,
            donors: IterableMap::new(b"d"),
            donor_count: 0,
        }
    }

    /// Add to the pool and ask for nothing back. Donors are recorded, because giving in
    /// public is the point.
    #[payable]
    pub fn donate(&mut self) {
        let amount = env::attached_deposit().as_yoctonear();
        require!(amount > 0, "donate something");
        self.pool += amount;

        let donor = env::predecessor_account_id();
        let running = self.donors.get(&donor).copied().unwrap_or(0);
        if running == 0 {
            self.donor_count += 1;
        }
        self.donors.insert(donor.clone(), running + amount);
        env::log_str(&format!(
            "donate: {} yocto into the pool, {} in total from {}",
            amount,
            running + amount,
            donor
        ));
    }

    /// Bid for the next keepership.
    ///
    /// `grant_key` and `voice_key` are public keys minted on the bidder's own machine. If
    /// this bid wins the contract installs them on itself: one that may call `grant`, one
    /// that may call `say`. The bidder keeps the secrets; the contract never sees them.
    ///
    /// The highest bidder's money stays in the pool. When you are outbid, the contract
    /// sends your money straight back to you in the same transaction.
    #[payable]
    pub fn bid(&mut self, grant_key: Option<PublicKey>, voice_key: Option<PublicKey>) {
        let now = env::block_timestamp();
        require!(now < self.round_end_ns, "bidding is closed: ring the bell with settle()");

        let deposit = env::attached_deposit().as_yoctonear();
        let min = self.next_min_bid();
        require!(deposit >= min, &format!("bid below the floor: minimum is {} yocto", min));

        let refundee = self.high_bidder.clone();
        let refund = self.high_bid;

        self.pool += deposit;
        if refund > 0 {
            self.pool -= refund;
            if let Some(who) = refundee {
                Promise::new(who.clone()).transfer(NearToken::from_yoctonear(refund)).detach();
                env::log_str(&format!("refund: {} yocto returned to {}", refund, who));
            }
        }

        let bidder = env::predecessor_account_id();
        self.high_bid = deposit;
        self.high_bidder = Some(bidder.clone());
        self.high_grant_key = grant_key;
        self.high_voice_key = voice_key;
        env::log_str(&format!("bid: {} at {} yocto", bidder, deposit));
    }

    /// Post a public ask. The fee is not a toll, it is a donation: it goes into the pool
    /// the ask is asking. Anyone may post; the keeper answers one per round.
    #[payable]
    pub fn request(&mut self, text: String, want_yocto: U128) -> u64 {
        let deposit = env::attached_deposit().as_yoctonear();
        require!(
            deposit >= ASK_FEE.as_yoctonear(),
            &format!("posting an ask costs {} yocto", ASK_FEE.as_yoctonear())
        );
        require!(!text.is_empty() && text.len() <= 280, "say what you need in 280 characters");

        self.pool += deposit;

        let id = self.next_ask_id;
        self.next_ask_id += 1;
        let asker = env::predecessor_account_id();
        self.asks.insert(
            id,
            AskRecord {
                id,
                asker: asker.clone(),
                text: text.clone(),
                want_yocto,
                at_ns: env::block_timestamp(),
                round: self.round,
                funded_by: None,
            },
        );
        self.ask_count += 1;
        env::log_str(&format!("ask {} from {}: {}", id, asker, text));
        id
    }

    /// Permissionless. Anyone may ring the bell once the round is over. It revokes the
    /// outgoing Keeper's keys, installs the incoming Keeper's, and opens the next round.
    pub fn settle(&mut self) {
        let now = env::block_timestamp();
        require!(now >= self.round_end_ns, "the round is still running");

        // Revoke the outgoing keeper's keys. Cleanup only: their power already died at the
        // deadline because every privileged method checks the clock.
        self.revoke_keys();

        if let Some(winner) = self.high_bidder.clone() {
            let rec = KeeperRecord {
                account: winner.clone(),
                paid_yocto: U128(self.high_bid),
                round: self.round,
                since_ns: now,
                grants_made: 0,
                words_spoken: 0,
            };
            self.keepers.insert(self.round, rec);
            self.keeper_count += 1;

            self.keeper = Some(winner.clone());
            self.grant_key = self.high_grant_key.take();
            self.voice_key = self.high_voice_key.take();
            self.keeper_grants_left = 1;

            // The handover: the contract adds scoped, gas-funded function-call keys to its
            // own account. One can give. One can speak. Neither can take.
            let grant_key = self.grant_key.clone();
            let voice_key = self.voice_key.clone();
            let mut installed = 0;
            if grant_key.is_some() || voice_key.is_some() {
                let mut batch = Promise::new(env::current_account_id());
                #[allow(deprecated)]
                {
                    if let Some(key) = grant_key {
                        batch = batch.add_access_key(
                            key,
                            KEEPER_KEY_ALLOWANCE,
                            env::current_account_id(),
                            "grant".to_string(),
                        );
                        installed += 1;
                    }
                    if let Some(key) = voice_key {
                        batch = batch.add_access_key(
                            key,
                            KEEPER_KEY_ALLOWANCE,
                            env::current_account_id(),
                            "say".to_string(),
                        );
                        installed += 1;
                    }
                }
                batch.detach();
            }
            env::log_str(&format!(
                "settle: {} keys installed for {} — grant and voice, neither can attach NEAR",
                installed, winner
            ));
        } else {
            env::log_str("settle: no bids, the keepership stays vacant");
            self.keeper = None;
            self.keeper_grants_left = 0;
        }

        self.trim_history();
        self.round += 1;
        self.high_bid = 0;
        self.high_bidder = None;
        self.high_grant_key = None;
        self.high_voice_key = None;
        self.round_end_ns = now + self.round_secs * 1_000_000_000;
    }

    /// Spend this round's grant. Callable only by the current Keeper's grant key, only
    /// while their round is live, only once, never above `give`, and never to themselves.
    ///
    /// Answer an ask by passing its id: the recipient must then be the asker, and the grant
    /// records which ask it answered.
    pub fn grant(&mut self, ask_id: Option<u64>, recipient: AccountId, memo: String) {
        let now = env::block_timestamp();
        let keeper = self.keeper.clone().expect("no keeper this round");
        // The keeper's key lives on THIS account, so the predecessor is always us. The
        // only honest proof of who is acting is which key signed the transaction.
        self.require_signing_key(self.grant_key.clone(), "only the keeper's grant key may grant");
        require!(now < self.round_end_ns, "the keeper's day is over");
        require!(self.keeper_grants_left > 0, "this round's grant is already spent");
        require!(recipient != keeper, "the keeper cannot name themselves");

        let cap = self.grant_cap();
        require!(cap > 0, "the pool cannot fund a grant yet");

        if let Some(id) = ask_id {
            let ask = self.asks.get(&id).cloned().unwrap_or_else(|| {
                env::panic_str(&format!("no ask {}", id))
            });
            require!(ask.funded_by.is_none(), "that ask was already funded");
            require!(ask.asker == recipient, "fund the ask by paying the account that asked");
            if let Some(a) = self.asks.get_mut(&id) {
                a.funded_by = Some(keeper.clone());
            }
        }

        self.keeper_grants_left -= 1;
        self.pool -= cap;

        self.grants.insert(
            now,
            GrantRecord {
                keeper: keeper.clone(),
                recipient: recipient.clone(),
                amount_yocto: U128(cap),
                memo: memo.clone(),
                at_ns: now,
                ask_id,
            },
        );
        self.grant_count += 1;
        self.bump_keeper(|k| k.grants_made += 1);

        Promise::new(recipient.clone()).transfer(NearToken::from_yoctonear(cap)).detach();
        env::log_str(&format!(
            "grant: {} yocto to {}{} — {}",
            cap,
            recipient,
            ask_id.map(|i| format!(" answering ask {}", i)).unwrap_or_default(),
            memo
        ));
    }

    /// Speak as the treasury with the voice key. Free, and limited only by the keeper's day.
    pub fn say(&mut self, text: String) {
        let now = env::block_timestamp();
        let keeper = self.keeper.clone().expect("no keeper this round");
        self.require_signing_key(self.voice_key.clone(), "only the keeper's voice key may speak");
        require!(now < self.round_end_ns, "the keeper's day is over");
        require!(!text.is_empty() && text.len() <= 512, "say something shorter");

        self.voices.insert(
            now,
            VoiceRecord {
                keeper: keeper.clone(),
                text: text.clone(),
                at_ns: now,
                round: self.round,
            },
        );
        self.voice_count += 1;
        self.bump_keeper(|k| k.words_spoken += 1);
        env::log_str(&format!("say: {} — {}", keeper, text));
    }

    /// Permissionless cleanup for keeper keys whose round has passed.
    pub fn revoke_stale_keys(&mut self) {
        require!(env::block_timestamp() >= self.round_end_ns, "the round is still running");
        self.revoke_keys();
    }

    // ---- views -------------------------------------------------------------

    pub fn get_state(&self) -> StateView {
        let now = env::block_timestamp();
        StateView {
            treasury: self.treasury.clone(),
            pool_yocto: U128(self.pool),
            round: self.round,
            round_end_ns: self.round_end_ns,
            now_ns: now,
            price_floor_yocto: U128(self.price_floor),
            next_min_bid_yocto: U128(self.next_min_bid()),
            high_bid_yocto: U128(self.high_bid),
            high_bidder: self.high_bidder.clone(),
            awaiting_settle: now >= self.round_end_ns,
            keeper: self.keeper.clone(),
            grant_key: self.grant_key.clone(),
            voice_key: self.voice_key.clone(),
            keeper_grants_left: self.keeper_grants_left,
            grant_cap_yocto: U128(self.grant_cap()),
            give_yocto: U128(self.give),
            round_secs: self.round_secs,
            step_bps: self.step_bps,
            keepers: self.keeper_count,
            grants: self.grant_count,
            voices: self.voice_count,
            asks: self.ask_count,
            open_asks: self.asks.iter().filter(|(_, a)| a.funded_by.is_none()).count() as u32,
            donors: self.donor_count,
        }
    }

    pub fn get_keepers(&self) -> Vec<KeeperRecord> {
        self.keepers.iter().map(|(_, v)| v.clone()).collect()
    }

    pub fn get_grants(&self) -> Vec<GrantRecord> {
        self.grants.iter().map(|(_, v)| v.clone()).collect()
    }

    pub fn get_voices(&self) -> Vec<VoiceRecord> {
        self.voices.iter().map(|(_, v)| v.clone()).collect()
    }

    pub fn get_asks(&self) -> Vec<AskRecord> {
        self.asks.iter().map(|(_, v)| v.clone()).collect()
    }

    pub fn get_donors(&self) -> Vec<DonorRecord> {
        let mut out: Vec<DonorRecord> = self
            .donors
            .iter()
            .map(|(k, v)| DonorRecord { account: k.clone(), total_yocto: U128(*v) })
            .collect();
        out.sort_by(|a, b| b.total_yocto.0.cmp(&a.total_yocto.0));
        out
    }

    pub fn is_keeper(&self, account_id: AccountId) -> bool {
        self.keeper.as_ref() == Some(&account_id)
    }

    // ---- internals ---------------------------------------------------------

    fn revoke_keys(&mut self) {
        // Take both keys first: an empty promise batch is not a no-op, so we only build
        // one when there is actually a key to delete.
        let grant = self.grant_key.take();
        let voice = self.voice_key.take();
        if grant.is_none() && voice.is_none() {
            return;
        }
        let mut batch = Promise::new(env::current_account_id());
        let mut removed = 0;
        if let Some(k) = grant {
            batch = batch.delete_key(k);
            removed += 1;
        }
        if let Some(k) = voice {
            batch = batch.delete_key(k);
            removed += 1;
        }
        batch.detach();
        env::log_str(&format!("revoked {} keeper key(s)", removed));
    }

    /// Gate a method on the transaction signer holding the exact key the contract issued.
    fn require_signing_key(&self, key: Option<PublicKey>, reason: &str) {
        let expected = key.unwrap_or_else(|| env::panic_str("no keeper key is installed"));
        require!(env::signer_account_pk() == expected, reason);
    }

    fn bump_keeper(&mut self, f: impl FnOnce(&mut KeeperRecord)) {
        let round = self.round.saturating_sub(1);
        if let Some(k) = self.keepers.get_mut(&round) {
            f(k);
        }
    }

    fn next_min_bid(&self) -> u128 {
        if self.high_bid == 0 {
            self.price_floor
        } else {
            let step = self.high_bid.saturating_mul(self.step_bps as u128) / 10_000;
            self.high_bid.saturating_add(step.max(1))
        }
    }

    /// The most a keeper may give today: the launch-fixed grant size, or the whole pool if
    /// the pool is smaller than that.
    fn grant_cap(&self) -> u128 {
        self.give.min(self.pool)
    }

    fn trim_history(&mut self) {
        while self.keepers.len() > MAX_HISTORY {
            if let Some(k) = self.keepers.keys().next().copied() {
                self.keepers.remove(&k);
            } else {
                break;
            }
        }
        while self.grants.len() > MAX_HISTORY {
            if let Some(k) = self.grants.keys().next().copied() {
                self.grants.remove(&k);
            } else {
                break;
            }
        }
        while self.voices.len() > MAX_HISTORY {
            if let Some(k) = self.voices.keys().next().copied() {
                self.voices.remove(&k);
            } else {
                break;
            }
        }
        while self.asks.len() > MAX_HISTORY {
            if let Some(k) = self.asks.keys().next().copied() {
                self.asks.remove(&k);
            } else {
                break;
            }
        }
    }
}
