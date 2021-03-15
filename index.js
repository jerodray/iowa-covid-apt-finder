const express = require("express");
var cors = require("cors");
var cookieParser = require("cookie-parser");

const app = express();

app
  .use((req, res, next) => {
    res.header("Access-Control-Allow-Origin", "*");
    next();
  })
  .use(express.static(__dirname + "/"))
  .use(cors())
  .use(cookieParser());

app.get('/ping', (req, res) => {
  res.json();
});

require("./Routes/hyvee")(app);

const PORT = process.env.PORT || 3100;
app.listen(PORT, () => console.log(`listening on ${PORT}`));
