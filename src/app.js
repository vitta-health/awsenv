import { DEFAULT_ERROR_MSG } from './concerns/msgs.js';
import EnvSync from './sync.js';
import AwsSsm from './vendor/aws-ssm.js';


const { AWSENV_NAMESPACE, AWS_REGION } = process.env;

export default async (params) => {
  if (params.sync) {
    if (!params.namespace && !AWSENV_NAMESPACE) {
      console.error('❌ Namespace is required for sync operation');
      console.error('Use --namespace or set AWSENV_NAMESPACE environment variable');
      process.exit(1);
    }

    const syncOptions = {
      region: params.region || AWS_REGION,
      namespace: params.namespace || AWSENV_NAMESPACE,
      dryRun: params.dryRun,
      force: params.force,
      allSecure: params.allSecure,
      filePath: typeof params.sync === 'string' ? params.sync : '.env'
    };

    const envSync = new EnvSync(syncOptions);
    await envSync.sync();
    return;
  }

  // Original functionality: fetch parameters from AWS
  if (!params.namespace && !AWSENV_NAMESPACE) {
    console.error(DEFAULT_ERROR_MSG);
    process.exit(1);
  }

  let response = null;
  try {
    response = await AwsSsm.getParametersByPath(params.region || AWS_REGION, params.namespace || AWSENV_NAMESPACE)
  } catch (err) {
    throw err;
  }

  const variables = response
    .Parameters
    .reduce((acc, param) => {
      acc.push({
        key: param.Name.split('/').pop(),
        value: param.Value.trim().replace(/\n/g, ''),
      });
      return acc;
    }, [])
    .map((param) => `${params.withoutExporter ? '' : 'export '}${param.key}=${param.value}`);

  process.stdout.write(variables.join('\n'));
}

