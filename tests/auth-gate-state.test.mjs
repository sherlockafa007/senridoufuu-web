import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveGateState } from '../js/shared/auth-gate-state.js';

test('resolveGateState：未登录返回 guest', () => {
  assert.equal(resolveGateState({ user: null, isAdminUser: false, status: undefined }), 'guest');
});

test('resolveGateState：管理员优先于其他状态，返回 admin', () => {
  assert.equal(resolveGateState({ user: {}, isAdminUser: true, status: 'pending' }), 'admin');
  assert.equal(resolveGateState({ user: {}, isAdminUser: true, status: undefined }), 'admin');
});

test('resolveGateState：非管理员 + approved 返回 approved', () => {
  assert.equal(resolveGateState({ user: {}, isAdminUser: false, status: 'approved' }), 'approved');
});

test('resolveGateState：非管理员 + disabled 返回 disabled', () => {
  assert.equal(resolveGateState({ user: {}, isAdminUser: false, status: 'disabled' }), 'disabled');
});

test('resolveGateState：非管理员 + pending 或未知状态 一律返回 pending', () => {
  assert.equal(resolveGateState({ user: {}, isAdminUser: false, status: 'pending' }), 'pending');
  assert.equal(resolveGateState({ user: {}, isAdminUser: false, status: undefined }), 'pending');
  assert.equal(
    resolveGateState({ user: {}, isAdminUser: false, status: 'some_unknown_value' }),
    'pending',
  );
});
