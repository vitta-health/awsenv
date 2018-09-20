const { SSM } = require('aws-sdk');

module.exports = class AwsSsm {
  static getParametersByPath(region = 'us-east-1', path) {
    const ssmOptions = {
      Path: path,
      Recursive: true,
      WithDecryption: true
    };

    let ssm = new SSM({ region: region })

    return new Promise((resolve, reject) => {
      ssm.getParametersByPath(ssmOptions, (err, data) => {
        if (err) return reject(err);
        return resolve(data);
      });
    });
  }
}
