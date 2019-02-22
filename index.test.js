'use strict';

const _startCase = require('lodash/startCase'),
  _noop = require('lodash/noop'),
  passport = require('passport'),
  filename = __filename.split('/').pop().split('.').shift(),
  lib = require(`./${filename}`);

describe(_startCase(filename), function () {
  describe('isProtectedRoute', function () {
    const fn = lib[this.description];

    it('is true if edit mode', function () {
      expect(fn({ query: { edit: true }})).toEqual(true);
    });

    it('is true if POST to api', function () {
      expect(fn({ query: {}, method: 'POST' })).toEqual(true);
    });

    it('is true if PUT to api', function () {
      expect(fn({ query: {}, method: 'PUT' })).toEqual(true);
    });

    it('is true if DELETE to api', function () {
      expect(fn({ query: {}, method: 'DELETE' })).toEqual(true);
    });

    it('is false if GET to api (or non-edit page)', function () {
      expect(fn({ query: {}, method: 'GET' })).toEqual(false);
    });
  });

  describe('isAuthenticated', function () {
    const fn = lib[this.description];

    it('passes through if authenticated (through session, etc)', function (done) {
      fn()({ isAuthenticated: () => true }, null, done);
    });

    it('calls apikey auth if Authorization header is sent', function (done) {
      passport.authenticate = jest.fn().mockReturnValue((req, res, next) => next());

      fn()({ isAuthenticated: () => false, get: () => true }, null, function () {
        expect(passport.authenticate).toBeCalled();
        done();
      });
    });

    it('sets return url and redirects to login page if not authenticated', function () {
      const req = {
          isAuthenticated: () => false,
          get: () => false,
          originalUrl: 'domain.com',
          session: {}
        },
        res = {
          redirect: jest.fn()
        };

      fn({ path: '/' })(req, res); // never calls next(), but checks synchronously
      expect(req.session.returnTo).toEqual(req.originalUrl);
      expect(res.redirect.call.length).toEqual(1);
    });
  });

  describe('checkAuthentication', function () {
    const fn = lib[this.description],
      cb = fn({ path: '/foo', prefix: 'domain.com/foo', port: '80'});

    it('calls `next` if no error', function () {
      const nextSpy = jest.fn();

      cb(null, {}, {}, nextSpy);
      expect(nextSpy).toBeCalled();
    });

    it('calls `onLogout` if is an error', function () {
      const nextSpy = jest.fn(),
        redirect = jest.fn(),
        logout = jest.fn();

      cb(new Error('error'), { logout }, { redirect }, nextSpy);
      expect(logout).toBeCalled();
      expect(redirect).toBeCalled();
      expect(nextSpy).not.toBeCalled();
    });
  });

  describe('protectRoutes', function () {
    const fn = lib[this.description];

    it('authenticates against protected routes', function (done) {
      lib.isProtectedRoute = jest.fn().mockReturnValue(true);
      lib.isAuthenticated = jest.fn().mockReturnValue((req, res, next) => next());

      fn({})({}, {}, function () {
        expect(lib.isAuthenticated).toBeCalled();
        done();
      });
    });

    it('passes through unprotected routes', function (done) {
      lib.isProtectedRoute = jest.fn().mockReturnValue(false);
      lib.isAuthenticated = jest.fn();

      fn({})({}, {}, function () {
        expect(lib.isAuthenticated).not.toBeCalled();
        done();
      });
    });
  });

  describe('onLogin', function () {
    const fn = lib[this.description],
      mockRes = {
        setHeader: jest.fn(),
        send: jest.fn(),
        end: jest.fn(),
      };

    it('shows the login page if there are no errors', function () {
      fn({ path: '' }, [])({ flash: _noop }, mockRes);
      expect(mockRes.send).toBeCalled();
    });

    it('forcibly clears http credentials if there is a credential error', function () {
      fn({ path: '' }, [])({ flash: function () { return { error: ['Invalid username/password'] }; } }, mockRes);
      expect(mockRes.setHeader).toBeCalledWith('WWW-Authenticate', 'Basic realm="Incorrect Credentials"');
      expect(mockRes.end).toBeCalledWith('Access denied');
    });
  });

  describe('onLogout', function () {
    const fn = lib[this.description];

    it('logs out the user', function () {
      const req = { logout: jest.fn() };

      fn({ path: '' })(req, { redirect: _noop });
      expect(req.logout).toBeCalled();
    });

    it('redirects to the login page', function () {
      const res = { redirect: jest.fn() };

      fn({ prefix: 'domain.com' })({ logout: _noop }, res);
      expect(res.redirect).toBeCalledWith('http://domain.com/_auth/login');
    });
  });

  describe('withAuthLevel', function () {
    const fn = lib[this.description],
      reqObj = {
        user: {
          auth: 'write'
        }
      },
      mockRes = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      };

    lib.unauthorized = jest.fn();

    it('throws an error if userLevel is undefined', function () {
      const next = jest.fn(),
        cb = () => fn('admin')({}, {}, next);

      expect(cb).toThrow();
    });

    it('sends unauthorized response if user does not have proper permissions', function () {
      const next = jest.fn();

      fn('admin')(reqObj, mockRes, next);
      expect(next).not.toBeCalled();
      expect(mockRes.status).toBeCalled();
      expect(mockRes.json).toBeCalled();
    });

    it('calls next if the user has the appropriate level', function () {
      const next = jest.fn();

      fn('write')(reqObj, mockRes, next);
      expect(next).toBeCalled();
      expect(lib.unauthorized).not.toBeCalled();
    });
  });
});