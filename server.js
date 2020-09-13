const express = require('express');
const morgan = require('morgan');

const api = require('./api');
const { connectToDB } = require('./lib/mongo');

const app = express();
const port = process.env.PORT || 8000;

const { getSubmissionDownloadStreamByFilename } = require('./models/assignments');

const { applyRateLimit } = require('./lib/redis');

app.use(morgan('dev'));

app.use(express.json());
app.use(express.static('public'));

app.use(applyRateLimit);

app.use('/', api);

app.get('/submissions/:filename', (req, res, next) =>{
  getSubmissionDownloadStreamByFilename(req.params.filename)
  .on('error', (err) => {
    if (err.code === 'ENOENT') {
      next();
    } else {
      next(err);
    }
  })
  .on('file', (file) => {
    res.status(200).type(file.metadata.contentType);
  })
  .pipe(res);
});

app.use('*', function (req, res, next) {
  res.status(404).json({
    error: "Requested resource " + req.originalUrl + " does not exist"
  });
});

connectToDB(() => {
  app.listen(port, () => {
    console.log("== Server is running on port", port);
  });
});
