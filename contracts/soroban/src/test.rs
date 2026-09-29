#![cfg(test)]

use super::*;
use soroban_sdk::{
    testutils::{Address as _, Ledger as _, MockAuth, MockAuthInvoke},
    token::Client as TokenClient,
    token::StellarAssetClient,
    Address, Env, IntoVal, Vec,
};

#[test]
fn test_allowance_handshake_and_pull() {
    let env = Env::default();

    // In unit tests, we mock the wallet signatures (mock_all_auths)
    // so we can test the logic without a real frontend connecting.
    env.mock_all_auths();

    // Generate dummy addresses for our actors
    let user = Address::generate(&env);
    let merchant = Address::generate(&env);
    let token_admin = Address::generate(&env);

    // Deploy a mock testnet token (represents our USDC with 7 decimals)
    let token_address = env
        .register_stellar_asset_contract_v2(token_admin.clone())
        .address();
    let token_client = TokenClient::new(&env, &token_address);
    let token_admin_client = StellarAssetClient::new(&env, &token_address);

    // Mint 100 USDC to the user to start
    token_admin_client.mint(&user, &100_0000000);

    // Register our Orbit Contract
    let contract_id = env.register(OrbitContract, ());
    let orbit_client = OrbitContractClient::new(&env, &contract_id);

    // ------------------------------------------------------------------------
    // SCENARIO 1: THE HANDSHAKE
    // ------------------------------------------------------------------------
    let amount = 29_0000000; // 29 USDC (with 7 zeroes for precision)
    let interval = 30 * 24 * 60 * 60; // 30 days in seconds

    // User approves the contract to spend the recurring charge
    token_client.approve(&user, &orbit_client.address, &amount, &2000000);

    // User creates the vault (approving the 29 USDC recurring charge)
    orbit_client.create_vault(&user, &merchant, &token_address, &amount, &interval);

    // ------------------------------------------------------------------------
    // SCENARIO 2: THE PULL
    // ------------------------------------------------------------------------
    // Merchant executes the billing
    orbit_client.pull_funds(&user, &merchant);

    // Verify the math! The merchant should have exactly 29 USDC.
    assert_eq!(token_client.balance(&merchant), 29_0000000);
    // The user should have 100 - 29 = 71 USDC remaining.
    assert_eq!(token_client.balance(&user), 71_0000000);
}

// ----------------------------------------------------------------------------
// ISSUE #1: INPUT VALIDATION IN CREATE_VAULT
// ----------------------------------------------------------------------------

#[test]
#[should_panic]
fn test_create_vault_fails_when_amount_zero() {
    let env = Env::default();
    env.mock_all_auths();

    let user = Address::generate(&env);
    let merchant = Address::generate(&env);
    let token = Address::generate(&env);

    let contract_id = env.register(OrbitContract, ());
    let orbit_client = OrbitContractClient::new(&env, &contract_id);

    orbit_client.create_vault(&user, &merchant, &token, &0, &86400);
}

#[test]
#[should_panic]
fn test_create_vault_fails_when_amount_negative() {
    let env = Env::default();
    env.mock_all_auths();

    let user = Address::generate(&env);
    let merchant = Address::generate(&env);
    let token = Address::generate(&env);

    let contract_id = env.register(OrbitContract, ());
    let orbit_client = OrbitContractClient::new(&env, &contract_id);

    orbit_client.create_vault(&user, &merchant, &token, &-1, &86400);
}

#[test]
#[should_panic]
fn test_create_vault_fails_when_interval_zero() {
    let env = Env::default();
    env.mock_all_auths();

    let user = Address::generate(&env);
    let merchant = Address::generate(&env);
    let token = Address::generate(&env);

    let contract_id = env.register(OrbitContract, ());
    let orbit_client = OrbitContractClient::new(&env, &contract_id);

    orbit_client.create_vault(&user, &merchant, &token, &29_0000000, &0);
}

// ----------------------------------------------------------------------------
// ISSUE #2: EXPANDED UNIT TEST COVERAGE
// ----------------------------------------------------------------------------

#[test]
#[should_panic]
fn test_pull_before_interval_has_elapsed_fails() {
    let env = Env::default();
    env.mock_all_auths();

    let user = Address::generate(&env);
    let merchant = Address::generate(&env);
    let token_admin = Address::generate(&env);

    let token_address = env
        .register_stellar_asset_contract_v2(token_admin.clone())
        .address();
    let token_client = TokenClient::new(&env, &token_address);
    let token_admin_client = StellarAssetClient::new(&env, &token_address);
    token_admin_client.mint(&user, &100_0000000);

    let contract_id = env.register(OrbitContract, ());
    let orbit_client = OrbitContractClient::new(&env, &contract_id);

    let amount = 29_0000000;
    let interval = 86400; // 1 day

    token_client.approve(&user, &orbit_client.address, &100_0000000, &2000000);
    orbit_client.create_vault(&user, &merchant, &token_address, &amount, &interval);

    // Initial pull at timestamp 1000
    env.ledger().set_timestamp(1000);
    orbit_client.pull_funds(&user, &merchant);

    // Advance timestamp by less than interval (1000 + 40000 < 1000 + 86400)
    env.ledger().set_timestamp(1000 + 40000);

    // Fails because interval hasn't elapsed yet
    orbit_client.pull_funds(&user, &merchant);
}

#[test]
fn test_second_pull_succeeds_once_interval_has_elapsed() {
    let env = Env::default();
    env.mock_all_auths();

    let user = Address::generate(&env);
    let merchant = Address::generate(&env);
    let token_admin = Address::generate(&env);

    let token_address = env
        .register_stellar_asset_contract_v2(token_admin.clone())
        .address();
    let token_client = TokenClient::new(&env, &token_address);
    let token_admin_client = StellarAssetClient::new(&env, &token_address);
    token_admin_client.mint(&user, &100_0000000);

    let contract_id = env.register(OrbitContract, ());
    let orbit_client = OrbitContractClient::new(&env, &contract_id);

    let amount = 29_0000000;
    let interval = 86400; // 1 day

    token_client.approve(&user, &orbit_client.address, &100_0000000, &2000000);
    orbit_client.create_vault(&user, &merchant, &token_address, &amount, &interval);

    // First pull at timestamp 1000
    env.ledger().set_timestamp(1000);
    orbit_client.pull_funds(&user, &merchant);
    assert_eq!(token_client.balance(&merchant), 29_0000000);
    assert_eq!(token_client.balance(&user), 71_0000000);

    // Advance timestamp by exactly the interval (1000 + 86400)
    env.ledger().set_timestamp(1000 + 86400);
    orbit_client.pull_funds(&user, &merchant);

    // Second pull succeeds
    assert_eq!(token_client.balance(&merchant), 58_0000000);
    assert_eq!(token_client.balance(&user), 42_0000000);
}

#[test]
#[should_panic]
fn test_pull_on_vault_that_does_not_exist_fails() {
    let env = Env::default();
    env.mock_all_auths();

    let user = Address::generate(&env);
    let merchant = Address::generate(&env);

    let contract_id = env.register(OrbitContract, ());
    let orbit_client = OrbitContractClient::new(&env, &contract_id);

    // Pulling on non-existent vault should fail with "Vault does not exist"
    orbit_client.pull_funds(&user, &merchant);
}

#[test]
#[should_panic]
fn test_pull_authorized_by_different_merchant_fails() {
    let env = Env::default();
    let user = Address::generate(&env);
    let merchant = Address::generate(&env);
    let other_merchant = Address::generate(&env);
    let token_admin = Address::generate(&env);

    let token_address = env
        .register_stellar_asset_contract_v2(token_admin.clone())
        .address();
    let token_client = TokenClient::new(&env, &token_address);
    let token_admin_client = StellarAssetClient::new(&env, &token_address);
    token_admin_client.mint(&user, &100_0000000);

    let contract_id = env.register(OrbitContract, ());
    let orbit_client = OrbitContractClient::new(&env, &contract_id);

    // Create vault with mock_all_auths first
    env.mock_all_auths();
    token_client.approve(&user, &orbit_client.address, &29_0000000, &2000000);
    orbit_client.create_vault(&user, &merchant, &token_address, &29_0000000, &86400);

    // Now mock auth ONLY for other_merchant
    orbit_client.mock_auths(&[MockAuth {
        address: &other_merchant,
        invoke: &MockAuthInvoke {
            contract: &orbit_client.address,
            fn_name: "pull_funds",
            args: (&user, &merchant).into_val(&env),
            sub_invokes: &[],
        },
    }]);

    // Pulling with merchant while only other_merchant authorized should fail
    orbit_client.pull_funds(&user, &merchant);
}

#[test]
fn test_create_vault_overwrites_existing_terms_and_resets_last_pull_timestamp() {
    let env = Env::default();
    env.mock_all_auths();

    let user = Address::generate(&env);
    let merchant = Address::generate(&env);
    let token_admin = Address::generate(&env);

    let token_address = env
        .register_stellar_asset_contract_v2(token_admin.clone())
        .address();
    let token_client = TokenClient::new(&env, &token_address);
    let token_admin_client = StellarAssetClient::new(&env, &token_address);
    token_admin_client.mint(&user, &100_0000000);

    let contract_id = env.register(OrbitContract, ());
    let orbit_client = OrbitContractClient::new(&env, &contract_id);

    token_client.approve(&user, &orbit_client.address, &100_0000000, &2000000);

    // Create initial vault: 29 USDC, 86400s interval
    orbit_client.create_vault(&user, &merchant, &token_address, &29_0000000, &86400);

    // Pull at t = 1000
    env.ledger().set_timestamp(1000);
    orbit_client.pull_funds(&user, &merchant);
    assert_eq!(token_client.balance(&merchant), 29_0000000);

    // Overwrite the vault terms with 40 USDC and 172800s interval
    orbit_client.create_vault(&user, &merchant, &token_address, &40_0000000, &172800);

    // Check persistent storage to verify overwritten terms and reset last_pull_timestamp = 0
    let key = VaultKey {
        user: user.clone(),
        merchant: merchant.clone(),
    };
    let vault_before_pull: VaultData = env.as_contract(&contract_id, || {
        env.storage().persistent().get(&key).unwrap()
    });
    assert_eq!(vault_before_pull.amount_per_interval, 40_0000000);
    assert_eq!(vault_before_pull.interval_seconds, 172800);
    assert_eq!(vault_before_pull.last_pull_timestamp, 0);

    // Because last_pull_timestamp was reset to 0, pulling immediately at t = 1000 succeeds with new amount!
    orbit_client.pull_funds(&user, &merchant);
    assert_eq!(token_client.balance(&merchant), 69_0000000); // 29 + 40
    assert_eq!(token_client.balance(&user), 31_0000000); // 100 - 69
}

#[test]
fn test_batch_disburse_pays_every_recipient_correct_amount() {
    let env = Env::default();
    env.mock_all_auths();

    let sender = Address::generate(&env);
    let recipient_1 = Address::generate(&env);
    let recipient_2 = Address::generate(&env);
    let recipient_3 = Address::generate(&env);
    let token_admin = Address::generate(&env);

    let token_address = env
        .register_stellar_asset_contract_v2(token_admin.clone())
        .address();
    let token_client = TokenClient::new(&env, &token_address);
    let token_admin_client = StellarAssetClient::new(&env, &token_address);

    token_admin_client.mint(&sender, &100_0000000);

    let contract_id = env.register(OrbitContract, ());
    let orbit_client = OrbitContractClient::new(&env, &contract_id);

    token_client.approve(&sender, &orbit_client.address, &60_0000000, &2000000);

    let mut splits = Vec::new(&env);
    splits.push_back(PaymentSplit {
        recipient: recipient_1.clone(),
        amount: 10_0000000,
    });
    splits.push_back(PaymentSplit {
        recipient: recipient_2.clone(),
        amount: 20_0000000,
    });
    splits.push_back(PaymentSplit {
        recipient: recipient_3.clone(),
        amount: 30_0000000,
    });

    orbit_client.batch_disburse(&sender, &token_address, &splits);

    assert_eq!(token_client.balance(&recipient_1), 10_0000000);
    assert_eq!(token_client.balance(&recipient_2), 20_0000000);
    assert_eq!(token_client.balance(&recipient_3), 30_0000000);
    assert_eq!(token_client.balance(&sender), 40_0000000);
}

#[test]
fn test_batch_disburse_reverts_fully_when_transfer_fails() {
    let env = Env::default();
    env.mock_all_auths();

    let sender = Address::generate(&env);
    let recipient_1 = Address::generate(&env);
    let recipient_2 = Address::generate(&env);
    let token_admin = Address::generate(&env);

    let token_address = env
        .register_stellar_asset_contract_v2(token_admin.clone())
        .address();
    let token_client = TokenClient::new(&env, &token_address);
    let token_admin_client = StellarAssetClient::new(&env, &token_address);

    token_admin_client.mint(&sender, &100_0000000);

    let contract_id = env.register(OrbitContract, ());
    let orbit_client = OrbitContractClient::new(&env, &contract_id);

    // Only approve 30 USDC, but splits total 40 USDC
    token_client.approve(&sender, &orbit_client.address, &30_0000000, &2000000);

    let mut splits = Vec::new(&env);
    splits.push_back(PaymentSplit {
        recipient: recipient_1.clone(),
        amount: 20_0000000,
    });
    splits.push_back(PaymentSplit {
        recipient: recipient_2.clone(),
        amount: 20_0000000,
    });

    let res = orbit_client.try_batch_disburse(&sender, &token_address, &splits);
    assert!(res.is_err());

    // Verify atomic revert: recipient 1 must have 0, recipient 2 must have 0, sender must still have 100
    assert_eq!(token_client.balance(&recipient_1), 0);
    assert_eq!(token_client.balance(&recipient_2), 0);
    assert_eq!(token_client.balance(&sender), 100_0000000);
}
