
const RewireWebpackPlugin = require("rewire-webpack-plugin");
const webpackConf = require('./webpack.config.js');

webpackConf.externals = {
  cheerio: 'window',
  'react/addons': true,
  'react/lib/ExecutionEnvironment': true,
  'react/lib/ReactContext': true,
};

webpackConf.devtool = 'inline-source-map';

webpackConf.output = {
  filename: '[name].js',
};
webpackConf.node = {
  fs: 'empty',
  module: 'empty'
};
webpackConf.plugins.push(new RewireWebpackPlugin());

module.exports = function karmaConfig(config) {
  config.set({
    autoWatch: true,
    browserNoActivityTimeout: 60000,
    browsers: ['CustomChromeHeadless'],
    captureTimeout: 60000,
    colors: true,
    concurrency: Infinity,
    customLaunchers: {
      CustomChromeHeadless: {
        base: 'ChromeHeadless',
        flags: [
          '--headless',
          '--disable-gpu',
          '--no-sandbox',
          '--remote-debugging-port=9222',
        ],
      },
    },
    files: [
      'test/index.js',
    ],
    frameworks: ['mocha', 'chai', 'sinon'],
    logLevel: config.LOG_INFO,
    preprocessors: {
      'test/index.js': ['webpack', 'sourcemap'],
    },
    reporters: ['mocha'],
    singleRun: true,
    webpack: webpackConf,
    webpackMiddleware: {
      noInfo: true
    },
  });
};
