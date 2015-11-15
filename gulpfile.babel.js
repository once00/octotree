const gulp  = require('gulp')
const path  = require('path')
const merge = require('event-stream').merge
const map   = require('map-stream')
const spawn = require('child_process').spawn
const $     = require('gulp-load-plugins')()

// Tasks
gulp.task('clean', () => {
  return pipe('./tmp', $.clean())
})

gulp.task('build', (cb) => {
  $.runSequence('clean', 'styles', 'chrome', 'opera', 'safari', 'firefox', cb)
})

gulp.task('default', ['build'], () => {
  gulp.watch(['./libs/**/*', './src/**/*'], ['default'])
})

gulp.task('dist', ['build'], (cb) => {
  $.runSequence('firefox:xpi', 'chrome:zip', 'chrome:crx', 'opera:nex', cb)
})

gulp.task('test', ['build'], (cb) => {
  const ps = spawn(
    './node_modules/.bin/mocha',
    ['--harmony', '--reporter', 'spec', '--bail', '--recursive', '--timeout', '-1']
  )
  ps.stdout.pipe(process.stdout);
  ps.stderr.pipe(process.stderr);
  ps.on('close', cb)
})

gulp.task('styles', () => {
  return pipe(
    './src/styles/octotree.less',
    $.less(),
    $.autoprefixer({cascade: true}),
    './tmp'
  )
})

// Chrome
gulp.task('chrome:template', () => {
  return buildTemplate({CHROME: true})
})

gulp.task('chrome:js', ['chrome:template'], () => {
  return buildJs(['./src/config/chrome/overrides.js'], {CHROME: true})
})

gulp.task('chrome', ['chrome:js'], () => {
  return merge(
    pipe('./icons/**/*', './tmp/chrome/icons'),
    pipe(['./libs/**/*', './tmp/octotree.*',  './src/config/chrome/manifest.json'], './tmp/chrome/'),
    pipe('./src/config/chrome/background.js', $.babel(), './tmp/chrome/')
  )
})

gulp.task('chrome:zip', () => {
  return pipe('./tmp/chrome/**/*', $.zip('chrome.zip'), './dist')
})

gulp.task('chrome:_crx', (cb) => {
  $.run('"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"' +
    ' --pack-extension=' + path.join(__dirname, './tmp/chrome') +
    ' --pack-extension-key=' + path.join(process.env.HOME, '.ssh/chrome.pem')
  ).exec(cb)
})

gulp.task('chrome:crx', ['chrome:_crx'], () => {
  return pipe('./tmp/chrome.crx', './dist')
})

// Opera
gulp.task('opera', ['chrome'], () => {
  return pipe('./tmp/chrome/**/*', './tmp/opera')
})

gulp.task('opera:nex', () => {
  return pipe('./dist/chrome.crx', $.rename('opera.nex'), './dist')
})

// Firefox
gulp.task('firefox:template', () => {
  return buildTemplate({FIREFOX: true})
})

gulp.task('firefox:js', ['firefox:template'], () => {
  return buildJs([], {FIREFOX: true})
})

gulp.task('firefox', ['firefox:js'], () => {
  return merge(
    pipe('./icons/**/*', './tmp/firefox/data/icons'),
    pipe(['./libs/**/*', './tmp/octotree.*'], './tmp/firefox/data'),
    pipe('./src/config/firefox/firefox.js', $.babel(), './tmp/firefox/lib'),
    pipe('./src/config/firefox/package.json', './tmp/firefox')
  )
})

gulp.task('firefox:xpi', (cb) => {
  $.run('cd ./tmp/firefox && cfx xpi --output-file=../../dist/firefox.xpi').exec(cb)
})

// Safari
gulp.task('safari:template', () => {
  return buildTemplate({SAFARI: true})
})

gulp.task('safari:js', ['safari:template'], () => {
  return buildJs([], {SAFARI: true})
})

gulp.task('safari', ['safari:js'], () => {
  return merge(
    pipe('./icons/**/*', './tmp/safari/octotree.safariextension/icons'),
    pipe(
      ['./libs/**/*', './tmp/octotree.*', './src/config/safari/**/*'],
      './tmp/safari/octotree.safariextension/'
    )
  )
})

// Helpers
function pipe(src, ...transforms) {
  return transforms.reduce((stream, transform) => {
    const isDest = typeof transform === 'string'
    return stream.pipe(isDest ? gulp.dest(transform) : transform)
  }, gulp.src(src))
}

function html2js(template) {
  return map(escape)

  function escape(file, cb) {
    const path = $.util.replaceExtension(file.path, '.js')
    const content = file.contents.toString()
    const escaped = content
      .replace(/\\/g, "\\\\")
      .replace(/'/g, "\\'")
      .replace(/\r?\n/g, "\\n' +\n    '")
    const body = template.replace('$$', escaped)

    file.path = path
    file.contents = new Buffer(body)
    cb(null, file)
  }
}

function buildJs(overrides, ctx) {
  const src = [
    './tmp/template.js',
    './src/constants.js',
    './src/adapters/adapter.js',
    './src/adapters/github.js',
    './src/adapters/gitlab.js',
    './src/view.help.js',
    './src/view.error.js',
    './src/view.tree.js',
    './src/view.options.js',
    './src/util.location.js',
    './src/util.module.js',
    './src/util.async.js',
    './src/util.storage.js'
  ].concat(overrides)
   .concat('./src/octotree.js')

  return pipe(
    src,
    $.babel(),
    $.concat('octotree.js'),
    $.preprocess({context: ctx}),
    './tmp'
  )
}

function buildTemplate(ctx) {
  const LOTS_OF_SPACES = new Array(500).join(' ')

  return pipe(
    './src/template.html',
    $.preprocess({context: ctx}),
    $.replace('__SPACES__', LOTS_OF_SPACES),
    html2js('const TEMPLATE = \'$$\''),
    './tmp'
  )
}
