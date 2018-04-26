const AWS = require('aws-sdk');
const args = require('args');
const envs = [];

args.option('awsRegion', 'Região da AWS onde se encontra o SSM dos parâmetros ($AWS_REGION)', 'sa-east-1')
    .option('envPath', 'Namespace dos parâmetros no SSM ($AWS_ENV_PATH)');

const parameters = args.parse(process.argv, {
    name: 'awsenv',
});

if (!parameters.envPath && !process.env.AWS_ENV_PATH) {
    console.error(`usage: awsenv [options]`);
    console.error(`To see help text, you can run: \n \n`);
    console.error(`  awsenv help`);
    console.error(`  awsenv -h`);
    console.error(`awsenv: error: too few arguments`);
    process.exit();
}

const ssm = new AWS.SSM({ region: process.env.AWS_REGION || parameters.awsRegion });
ssm.getParametersByPath({
    Path: process.env.AWS_ENV_PATH || parameters.envPath,
    WithDecryption: true
}, function(err, data) {
    if (err) {
        console.error('Ocorreu um erro ao retornar os parâmetros desejados', err.stack);
        process.exit(1);
    }

    data.Parameters.forEach((parameter) => {
        const parameterDefinition = parameter.Name.split('/');

        const key = parameterDefinition[parameterDefinition.length - 1];
        const value = parameter.Value.trim().replace(/\n/g, '');

        envs.push(`export ${key}=${value}`);
    });

    console.log(envs.join('\n'));
});