import { mockAuthContract } from '../helpers/auth-contract.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';
import { verifyTokenWhenAllDevicesLogout } from '../../middlewares/auth.middleware.js';

const createResponse = () => ({
  statusCode: null,
  body: null,
  status(code) {
    this.statusCode = code;
    return this;
  },
  json(payload) {
    this.body = payload;
    return this;
  },
});

test.beforeEach(mockAuthContract);

test('logout individual no exige JWT cuando allDevices no esta activo', async () => {
  const req = {
    body: { refreshToken: 'refresh-token' },
    headers: {},
  };
  const res = createResponse();
  let nextCalled = false;

  await verifyTokenWhenAllDevicesLogout(req, res, async () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, true);
  assert.equal(res.statusCode, null);
});

test('logout global exige JWT cuando allDevices es true', async () => {
  const req = {
    body: { allDevices: true },
    headers: {},
  };
  const res = createResponse();
  let nextCalled = false;

  await verifyTokenWhenAllDevicesLogout(req, res, async () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, false);
  assert.equal(res.statusCode, 401);
});

test('logout global acepta JWT valido y llena req.user', async () => {
  process.env.JWT_SECRET = 'test-secret';

  const token = jwt.sign(
    { sub: 12, email: 'test@example.com', rol: 'ciudadano' },
    process.env.JWT_SECRET
  );
  const req = {
    body: { allDevices: true },
    headers: {
      authorization: `Bearer ${token}`,
    },
  };
  const res = createResponse();
  let nextCalled = false;

  await verifyTokenWhenAllDevicesLogout(req, res, async () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, true);
  assert.equal(req.user.sub, 12);
  assert.equal(res.statusCode, null);
});
