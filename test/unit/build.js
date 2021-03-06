'use strict';

var Lab = require('lab');
var lab = exports.lab = Lab.script();
var describe = lab.describe;
var it = lab.it;
var after = lab.after;
var afterEach = lab.afterEach;
var before = lab.before;
var beforeEach = lab.beforeEach;
var Code = require('code');
var expect = Code.expect;

var Promise = require('bluebird')
var sinon = require('sinon')
require('sinon-as-promised')(Promise)
var createCount = require('callback-count');
var stream = require('stream');
var fs = require('fs');
var tar = require('tar-fs');

var Builder = require('../../lib/steps/build.js');
var utils = require('../../lib/utils');
const vault = require('../../lib/external/vault')
const sshKeyReader = require('../../lib/steps/sshKeyReader')

var defaultOps = {
  dirs: {
    dockerContext: '/test/context'
  },
  logs: {
    dockerBuild: '/test/log'
  },
  saveToLogs: function () {},
  runnableBuildDockerfile: '/src/Dockerfile'
};

var ctx = {};

describe('build.js unit test', function () {
  beforeEach(function (done) {
    sinon.stub(utils, 'log');
    sinon.stub(utils, 'progress');
    sinon.stub(utils, 'error');
    sinon.stub(utils, 'dockerLog');
    done();
  });

  afterEach(function (done) {
    utils.log.restore();
    utils.progress.restore();
    utils.error.restore();
    utils.dockerLog.restore();
    done();
  });

  var saveEnvironmentVars = {
    'RUNNABLE_DOCKER': 'tcp://localhost:5555',
    'RUNNABLE_WAIT_FOR_WEAVE': 'waitForWeave; '
  };
  beforeEach(function (done) {
    Object.keys(saveEnvironmentVars).forEach(function (key) {
      ctx[key] = process.env[key];
      process.env[key] = saveEnvironmentVars[key];
    });
    done();
  });

  afterEach(function (done) {
    Object.keys(saveEnvironmentVars).forEach(function (key) {
      process.env[key] = ctx[key];
      delete ctx[key];
    });
    done();
  });

  describe('new test', function () {
    it('should load without envs', (done) => {
      delete process.env.RUNNABLE_DOCKER;
      new Builder(defaultOps);
      done();
    });
  });

  describe('runDockerBuild', function () {
    var build;
    var testRes = 'some string';
    beforeEach((done) => {
      process.env.RUNNABLE_DOCKER = 'unix:///var/run/docker.sock'
      process.env.RUNNABLE_DOCKERTAG = 'some-tag';
      build = new Builder(defaultOps);
      sinon.stub(build, 'getRegistryConfig').resolves(null)
      sinon.stub(build, 'getLocalRegistryConfig').resolves(null)
      sinon.stub(vault, 'readRegistryPassword').resolves({ 'data': { 'value': 'password'}})
      sinon.stub(build, '_getTarStream').returns(defaultOps.dirs.dockerContext);
      sinon.stub(build.docker, 'buildImage').yields(null, testRes);
      sinon.stub(build, '_handleBuild').yields(null, null);
      done();
    });

    afterEach((done) => {
      delete process.env.RUNNABLE_DOCKERTAG;
      delete process.env.RUNNABLE_BUILD_DOCKER_CONTEXT;
      build.getRegistryConfig.restore();
      build.getLocalRegistryConfig.restore();
      build._getTarStream.restore();
      build.docker.buildImage.restore();
      build._handleBuild.restore();
      vault.readRegistryPassword.restore();
      done();
    });
    describe('with registry', () => {
      before((done) => {
        process.env.RUNNABLE_DOCKER_REGISTRY_URL = 'dockerhub.com'
        process.env.RUNNABLE_DOCKER_REGISTRY_USERNAME = 'runnabot'
        process.env.RUNNABLE_VAULT_TOKEN_FILE_PATH = 'vault-pass'
        done()
      })

      after((done) => {
        delete process.env.RUNNABLE_DOCKER_REGISTRY_URL
        delete process.env.RUNNABLE_DOCKER_REGISTRY_USERNAME
        delete process.env.RUNNABLE_VAULT_TOKEN_FILE_PATH
        done()
      })

      it('should set proper options if registry info provided', (done) => {
        const url = 'quay.io'
        const username = 'hiphipjorge'
        const password = 'trust-the-process'
        build.getRegistryConfig.resolves({ registryConfig: { url, username, password }})
        build.runDockerBuild((err) => {
          if (err) { return done(err); }
          sinon.assert.calledOnce(build._getTarStream);
          sinon.assert.calledWithExactly(build.docker.buildImage,
            defaultOps.dirs.dockerContext,
            { t: process.env.RUNNABLE_DOCKERTAG,
              registryconfig: {
                'quay.io': { password, username }
              },
              dockerfile: undefined
            },
            sinon.match.func
          );
          sinon.assert.calledWithExactly(build._handleBuild, testRes, sinon.match.func);
          done();
        })
      })
    })
    describe('adding ssh keys', () => {
      const sshKeyArgs = { SSH_KEY_13: '-----BEGIN RSA PRIVATE KEY-----' }
      beforeEach((done) => {
        process.env.RUNNABLE_SSH_KEY_IDS = '13'
        process.env.RUNNABLE_BUILD_DOCKERFILE = true
        sinon.stub(sshKeyReader, 'createSSHKeys').resolves(sshKeyArgs)
        done()
      })

      afterEach((done) => {
        sshKeyReader.createSSHKeys.restore()
        delete process.env.RUNNABLE_SSH_KEY_IDS
        delete process.env.RUNNABLE_BUILD_DOCKERFILE
        done()
      })
      it('should set ssh-key build args', (done) => {
        build.getRegistryConfig.resolves({ sshKeyArgs })
        build.runDockerBuild((err) => {
          if (err) { return done(err); }
          sinon.assert.calledOnce(build._getTarStream);
          sinon.assert.calledWithExactly(
            build.docker.buildImage,
            defaultOps.dirs.dockerContext,
            { t: process.env.RUNNABLE_DOCKERTAG,
              buildargs: {
                'SSH_KEY_13': '-----BEGIN RSA PRIVATE KEY-----'
              },
              dockerfile: undefined
            },
            sinon.match.func
          );
          sinon.assert.calledWith(build._handleBuild, testRes);
          done();
        })
      })
    })
    describe('with context', function () {
      it('should set options correctly', function (done) {
        process.env.RUNNABLE_BUILD_DOCKER_CONTEXT = '/src/';
        build.runDockerBuild(function(err) {
          if (err) { return done(err); }
          sinon.assert.calledOnce(build._getTarStream);
          sinon.assert.calledWith(build.docker.buildImage,
            defaultOps.dirs.dockerContext,
            {
              t: process.env.RUNNABLE_DOCKERTAG,
              dockerfile: 'Dockerfile'
            }
          );
          sinon.assert.calledWithExactly(build._handleBuild, testRes, sinon.match.func);
          done();
        });
      });
      it('should set opts and do not change dockerfile path', function (done) {
        process.env.RUNNABLE_BUILD_DOCKER_CONTEXT = './';
        build.runDockerBuild(function(err) {
          if (err) { return done(err); }
          sinon.assert.calledOnce(build._getTarStream);
          sinon.assert.calledWith(
            build.docker.buildImage,
            defaultOps.dirs.dockerContext,
            {
              t: process.env.RUNNABLE_DOCKERTAG,
              dockerfile: 'src/Dockerfile'
            }
          );
          sinon.assert.calledWithExactly(build._handleBuild, testRes, sinon.match.func);
          done();
        });
      });
    });
    it('should call buildImage with correct tag', function (done) {
      build.runDockerBuild(function(err) {
        if (err) { return done(err); }
        sinon.assert.calledOnce(build._getTarStream);
        sinon.assert.calledWith(build.docker.buildImage,
          defaultOps.dirs.dockerContext,
          {
            t: process.env.RUNNABLE_DOCKERTAG,
            dockerfile: undefined
          }
        );
        sinon.assert.calledWithExactly(build._handleBuild, testRes, sinon.match.func);
        done();
      });
    });

    it('should call buildImage with extra flags', function (done) {
      process.env.RUNNABLE_BUILD_FLAGS = JSON.stringify({
        testFlag: 'dockerTestArgs',
        cpus: 100,
      });
      sinon.assert.notCalled(build._getTarStream);
      build.runDockerBuild(function(err) {
        if (err) { return done(err); }
        sinon.assert.calledOnce(build._getTarStream);
        sinon.assert.calledWith(
          build.docker.buildImage,
          defaultOps.dirs.dockerContext,
          {
            dockerfile: undefined,
            t: process.env.RUNNABLE_DOCKERTAG,
            cpus: 100,
            testFlag: 'dockerTestArgs'
          }
        );
        sinon.assert.calledWithExactly(build._handleBuild, testRes, sinon.match.func);
        delete process.env.RUNNABLE_BUILD_FLAGS;
        done();
      });
    });

    it('should callback error is buildImage errored', function (done) {
      const err = new Error('Expected error');
      build.docker.buildImage.yields(err);

      build.runDockerBuild(function(err) {
        sinon.assert.calledOnce(build._getTarStream);
        expect(build.docker.buildImage
          .calledWith(defaultOps.dirs.dockerContext,
            { dockerfile: undefined,
              t: process.env.RUNNABLE_DOCKERTAG })).to.be.true();

        if (err) {
          return done();
        }
        done(new Error('should have errored'));
      });
    });
  });

  describe('_getTarStream', function () {
    it('should create stream of current dir', function (done) {
      var ops = JSON.parse(JSON.stringify(defaultOps));
      ops.dirs.buildRoot = __dirname;
      var build = new Builder(ops);
      var tarS = build._getTarStream();
      expect(tarS.pipe).to.exist();
      done();
    });
    describe('tar.pack', function () {
      beforeEach(function (done) {
        sinon.stub(tar, 'pack').returns();
        done();
      });

      afterEach(function (done) {
        tar.pack.restore();
        delete process.env.RUNNABLE_BUILD_DOCKER_CONTEXT;
        done();
      });

      it('should call tar.pack', function (done) {
        var ops = JSON.parse(JSON.stringify(defaultOps));
        ops.dirs.buildRoot = __dirname;
        var build = new Builder(ops);
        build._getTarStream();
        sinon.assert.calledOnce(tar.pack);
        sinon.assert.calledWithExactly(tar.pack, ops.dirs.buildRoot);
        done();
      });

      it('should call tar.pack with proper context', function (done) {
        process.env.RUNNABLE_BUILD_DOCKER_CONTEXT = 'src/';
        var ops = JSON.parse(JSON.stringify(defaultOps));
        ops.dirs.repoRoot = __dirname;
        var build = new Builder(ops);
        build._getTarStream();
        sinon.assert.calledOnce(tar.pack);
        sinon.assert.calledWithExactly(tar.pack, ops.dirs.repoRoot + '/src');
        done();
      });
    });
  });

  describe('_handleBuild', function () {
    var clock;
    beforeEach(function (done) {
      clock = sinon.useFakeTimers();
      ctx.builder = new Builder(defaultOps);
      sinon.stub(ctx.builder, 'saveToLogs', function (cb) {
        return cb;
      });

      done();
    });

    afterEach(function (done) {
      ctx.builder.saveToLogs.restore();
      clock.restore();
      done();
    });

    it('should handle data and end events', function (done) {
      // setup
      var dataStream = new stream.PassThrough();
      var count = createCount(1, function (err) {
        expect(ctx.builder._handleBuildData.calledOnce).to.be.true();
        ctx.builder._handleBuildData.restore();
        done(err);
      });

      // things to watch (for data)
      sinon.stub(ctx.builder, '_handleBuildData');

      // start handling stuff (count.next here is the exit event)
      ctx.builder._handleBuild(dataStream, count.next);

      // trigger the things!
      dataStream.write(JSON.stringify({ 'stream': 'RUN HELLO' }));
      dataStream.end();
    });

    it('should callback on error emit', function (done) {
      // setup
      var dataStream = new stream.PassThrough();
      var count = function (err) {
        expect(ctx.builder._handleBuildData.called).to.be.false();
        expect(err.message).to.equal('some error');
        ctx.builder._handleBuildData.restore();
        ctx.builder.docker.modem.followProgress.restore();
        done();
      };

      // things to watch (for data)
      // var error = new Error('some error');
      sinon.stub(ctx.builder, '_handleBuildData');
      sinon.stub(ctx.builder.docker.modem, 'followProgress',
        function (s, f) {
          // the final callback returns a String if there's an error.
          // seriously.
          f('some error');
        });

      // start handling stuff (count.next here is the exit event)
      ctx.builder._handleBuild(dataStream, count);
    });

    it('should callback error on build timeout', function (done) {
      process.env.RUNNABLE_BUILD_LINE_TIMEOUT_MS = 10;
      var dataStream = new stream.PassThrough();
      sinon.stub(dataStream, 'removeAllListeners').returns();
      sinon.stub(ctx.builder, '_handleBuildData').returns();
      sinon.stub(ctx.builder.docker.modem, 'followProgress',
        function (s, f, p) {
          p('data');
        });

      ctx.builder._handleBuild(dataStream, function (err) {
        sinon.assert.calledOnce(ctx.builder._handleBuildData);
        sinon.assert.calledWith(ctx.builder._handleBuildData, 'data');
        sinon.assert.calledOnce(dataStream.removeAllListeners);

        expect(err.message).to.equal('build timeout');
        ctx.builder._handleBuildData.restore();
        ctx.builder.docker.modem.followProgress.restore();
        done();
      });
      // cause timeout
      clock.tick(100);
    });

    it('should not timeout if not defined', function (done) {
      delete process.env.RUNNABLE_BUILD_LINE_TIMEOUT_MS;
      var dataStream = new stream.PassThrough();
      sinon.stub(dataStream, 'removeAllListeners').returns();
      sinon.stub(dataStream, 'end').returns();
      sinon.stub(ctx.builder, '_handleBuildData').returns();
      sinon.stub(ctx.builder.docker.modem, 'followProgress',
        function (s, f, p) {
          p('data');
        });

      ctx.builder._handleBuild(dataStream, function (err) {
        if (err) { return done(err); }
      });

      clock.tick(100);

      sinon.assert.calledOnce(ctx.builder._handleBuildData);
      sinon.assert.calledWith(ctx.builder._handleBuildData, 'data');
      sinon.assert.notCalled(dataStream.removeAllListeners);
      sinon.assert.notCalled(dataStream.end);
      ctx.builder._handleBuildData.restore();
      ctx.builder.docker.modem.followProgress.restore();
      done();
    });
  });

  describe('_handleBuildData', function () {
    var ops;
    var logStub;

    beforeEach(function (done) {
      logStub = sinon.stub();
      ops = {
        dirs: {
          dockerContext: '/test/context'
        },
        logs: {
          dockerBuild: '/test/log'
        },
        saveToLogs: function () {
          return logStub;
        }
      };
      sinon.stub(fs , 'appendFileSync');
      done();
    });

    afterEach(function (done) {
      fs.appendFileSync.restore();
      done();
    });

    it('should call progress if not stream', function (done) {
      var build = new Builder(ops);
      build._handleBuildData({other: 'testString'});
      expect(utils.progress.called).be.true();
      done();
    });

    it('should not print blacklisted line', function (done) {
      var testString = 'Removing intermediate container';

      var build = new Builder(ops);
      build._handleBuildData({stream: testString});
      expect(
        fs.appendFileSync.withArgs(ops.logs.dockerBuild, testString).calledOnce)
        .to.equal(true);
      expect(logStub.called).be.true();
      expect(utils.dockerLog.notCalled).be.true();
      done();
    });

    it('should print error', function (done) {
      var testString = 'error';

      var build = new Builder(ops);
      build._handleBuildData({
        stream: 'stream',
        error: testString
      });
      expect(
        fs.appendFileSync.withArgs(ops.logs.dockerBuild, testString).calledOnce)
        .to.equal(true);
      expect(logStub.called).be.true();
      done();
    });

    it('should just print if not special line', function (done) {
      var testString = '-----> using cache';

      var build = new Builder(ops);
      build._handleBuildData({stream: testString});
      expect(
        fs.appendFileSync.withArgs(ops.logs.dockerBuild, testString).calledOnce)
        .to.equal(true);
      done();
    });

    it('should remove weave from output', function (done) {
      var testString = '  RUN ' + process.env.RUNNABLE_WAIT_FOR_WEAVE +
        'npm install';

      var build = new Builder(ops);
      build._handleBuildData({stream: testString});
      expect(
        fs.appendFileSync.withArgs(ops.logs.dockerBuild, testString).calledOnce)
        .to.equal(true);
      expect(utils.dockerLog.args[0][0]).to.equal('  RUN npm install');
      done();
    });

    it('should ignore if waitForWeave not defined', function (done) {
      delete process.env.RUNNABLE_WAIT_FOR_WEAVE;
      var testString = '  RUN npm install';

      var build = new Builder(ops);
      build._handleBuildData({stream: testString});
      expect(
        fs.appendFileSync.withArgs(ops.logs.dockerBuild, testString).calledOnce)
        .to.equal(true);
      expect(utils.dockerLog.args[0][0]).to.equal('  RUN npm install');
      done();
    });
  });
});
