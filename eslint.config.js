const js = require('@eslint/js');
const globals = require('globals');

module.exports = [
  { ignores: ['node_modules/**', 'assets/**', 'tools/**'] },

  // 浏览器经典脚本（<script src>）
  {
    files: ['js/**/*.js'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'script',
      globals: { ...globals.browser },
    },
    rules: {
      ...js.configs.recommended.rules,
      'no-unused-vars': ['warn', { ignoreRestSiblings: true }],
      'no-undef': 'error',
    },
  },

  // js/tracking.js 与 js/shared/* 是 ES 模块（<script type="module"> / import）
  {
    files: ['js/tracking.js', 'js/shared/**/*.js'],
    languageOptions: { sourceType: 'module' },
  },

  // Node CommonJS：爬虫、脚本、测试
  {
    files: ['scripts/**/*.js', 'tests/**/*.js'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'commonjs',
      globals: { ...globals.node },
    },
    rules: {
      ...js.configs.recommended.rules,
      'no-unused-vars': ['warn', { ignoreRestSiblings: true }],
    },
  },

  // Cloudflare Pages Functions：ESM + Worker/浏览器全局
  {
    files: ['functions/**/*.js'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: { ...globals.browser, ...globals.node },
    },
    rules: {
      ...js.configs.recommended.rules,
      'no-unused-vars': ['warn', { ignoreRestSiblings: true }],
    },
  },

  // 浏览器端独立脚本（solutions 下的 .js）
  {
    files: ['solutions/**/*.js'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'script',
      globals: { ...globals.browser },
    },
    rules: {
      ...js.configs.recommended.rules,
      'no-unused-vars': 'warn',
      'no-undef': 'error',
    },
  },

  // sdf-admin Worker：ESM + Workers 运行时全局（fetch/Response/crypto…）
  {
    files: ['workers/**/*.js'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: { ...globals.serviceworker },
    },
    rules: {
      ...js.configs.recommended.rules,
      'no-unused-vars': ['warn', { ignoreRestSiblings: true }],
    },
  },

  // ESM 测试文件（Worker 源码是 ESM，测试也得用 ESM）
  {
    files: ['tests/**/*.mjs'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: { ...globals.node },
    },
    rules: {
      ...js.configs.recommended.rules,
      'no-unused-vars': ['warn', { ignoreRestSiblings: true }],
    },
  },

  // 允许空 catch（如 tracking.js 故意吞掉非关键错误，不让埋点拖垮页面）
  {
    rules: { 'no-empty': ['error', { allowEmptyCatch: true }] },
  },
];
