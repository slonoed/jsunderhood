import through from 'through2';
import gulp from 'gulp';
import watch from 'gulp-watch';
import rename from 'gulp-rename';
import data from 'gulp-data';
import jade from 'gulp-jade';
import debug from 'gulp-debug';
import replace from 'gulp-replace';
import { log } from 'gulp-util';
import buildbranch from 'buildbranch';
import rss from 'rss';
import del from 'del';
import fs from 'fs-extra';
import { outputFile as output } from 'fs-extra';
import express from 'express';
import assign from 'object-assign';
import sequence from 'run-sequence';
import each from 'each-done';
import path from 'path';
import numd from 'numd';
import moment from 'moment';
import { stats as finalStats } from './final-stats.json';
import { site } from './package.json';
import extract from 'article-data';

const d = input => moment(new Date(input)).format("DD MMMM YYYY");
const unix = text => moment(new Date(text)).unix();

const env = process.env.NODE_ENV || 'dev';
const getBasename = (file) => path.basename(file.relative, path.extname(file.relative));

var articles = [];
var articleHarvesting = function() {
  return through.obj(function(file, enc, cb) {
    var article = extract(file.contents.toString());
    articles.push({
      site: site,
      filename: file.relative,
      url: getBasename(file) + '/',
      title: article.titleHtml,
      image: article.image,
      descHtml: article.descHtml,
      descText: article.descText,
      date: article.date,
      contentHtml: article.contentHtml,
      rss: { url: site.site_url + getBasename(file) + '/' }
    });
    articles.sort(function(a, b) { return a.sortableDate - b.sortableDate; });
    cb(null, file);
  });
};

gulp.task('articles-registry', function() {
  articles = [];
  return gulp.src(['./posts/*.md'])
    .pipe(replace('https://jsunderhood.ru', 'http://localhost:4000'))
    .pipe(articleHarvesting());
});

gulp.task('articles-registry-prod', function() {
  articles = [];
  return gulp.src('/posts/*.md').pipe(articleHarvesting());
});

gulp.task('index-page', function() {
  var groupInGrid = function(state, item, i) {
    if (i % 3 === 0) { state.push([]); }
    state[state.length - 1].push(item);
    return state;
  };
  return gulp.src('layouts/index.jade')
    .pipe(jade({
      pretty: true,

      locals: {
        title: site.title,
        url: '',
        desc: site.description,
        site: site,
        list: articles.reduce(groupInGrid, [])
      }
    }))
    .pipe(rename({ basename: 'index' }))
    .pipe(gulp.dest('dist'));
});



gulp.task('stats-page', function() {
  var stats = [].concat(finalStats);
  stats.reverse();
  return gulp.src('layouts/stats.jade')
    .pipe(jade({
      pretty: true,

      locals: {
        title: 'Статистика jsunderhood',
        url: 'stats/',
        desc: site.description,
        site: site,
        stats: stats,
        ownTweetsUnit: numd('cвой твит', 'cвоих твита', 'cвоих твитов'),
        retweetsUnit: numd('ретвит', 'ретвита', 'ретвитов'),
        repliesUnit: numd('ответ', 'ответа', 'ответов')
      }
    }))
    .pipe(rename({ dirname: 'stats' }))
    .pipe(rename({ basename: 'index' }))
    .pipe(gulp.dest('dist'));
});

gulp.task('about-page', function() {
  var readme = fs.readFileSync('./README.md', { encoding: 'utf8' });
  var article = extract(readme);

  return gulp.src('layouts/article.jade')
    .pipe(jade({
      pretty: true,
      locals: assign({}, article, {
        title: 'О проекте',
        url: 'about/',
        site: site
      })
    }))
    .pipe(rename({ dirname: 'about' }))
    .pipe(rename({ basename: 'index' }))
    .pipe(gulp.dest('dist'));
});

gulp.task('articles-pages', function(done) {
  each(articles, function(article) {
    return gulp.src('layouts/article.jade')
      .pipe(data(function() { return article; }))
      .pipe(jade({ pretty: true }))
      .pipe(rename({ dirname: article.url }))
      .pipe(rename({ basename: 'index' }))
      .pipe(gulp.dest('dist'));
  }, done);
});

gulp.task('rss', function(done) {
  var feed = new rss(site);
  articles.forEach(function(article) {
    feed.item(assign({}, article, article.rss));
  });
  output('dist/rss.xml', feed.xml({ indent: true }), done);
});

gulp.task('default', ['watch']);

gulp.task('watch', ['express', 'build'], function() {
  watch(['**/*{jade,md,json,js}', '*.css'], function() { gulp.start('build'); });
});

gulp.task('clean', function(done) { del('dist', done); });


gulp.task('build-common', function(done) {
  sequence(['index-page', 'articles-pages', 'rss', 'about-page', 'stats-page'], 'cname', 'css', 'js', done);
});

gulp.task('build', function(done) {
  sequence('articles-registry', 'build-common', done);
});

gulp.task('build-prod', function(done) {
  sequence('clean', 'articles-registry-prod', 'build-common', done);
});

gulp.task('cname', function() {
  return gulp.src('CNAME').pipe(gulp.dest('dist'));
});

gulp.task('css-bootstrap', function() {
  return gulp.src('node_modules/bootstrap/dist/**').pipe(gulp.dest('dist'));
});

gulp.task('css', ['css-bootstrap'], function() {
  return gulp.src('styles.css').pipe(gulp.dest('dist/css'));
});

gulp.task('js', function() {
  return gulp.src([
    'node_modules/tablesort/src/tablesort.js',
    'node_modules/tablesort/src/sorts/tablesort.numeric.js'
  ]).pipe(gulp.dest('dist/js'));
});

gulp.task('gh', ['build-prod'], function(done) {
  buildbranch({ branch: 'gh-pages', folder: 'dist' }, done);
});

gulp.task('express', function() {
  var app = express();
  app.use(express.static('dist'));
  app.listen(4000);

  log('Server is running on http://localhost:4000');
});
