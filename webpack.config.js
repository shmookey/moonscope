export default {
  "entry": "./build/src/app.js",
  "mode": "development",
  "devtool": "eval-source-map",
  "module": {
    "rules": [
      {
        "test":    /\.js$/,
        "enforce": "pre",
        "use":     ["source-map-loader"]
      }
    ]
  }
}
