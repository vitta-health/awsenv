import { 
  GetParametersByPathCommand,
  PutParameterCommand,
  SSMClient, 
} from '@aws-sdk/client-ssm';


export default class AwsSsm {
  static async getParametersByPath(region = 'us-east-1', path) {
    const client = new SSMClient({ region });
    
    const command = new GetParametersByPathCommand({
      Path: path,
      Recursive: true,
      WithDecryption: true
    });

    try {
      const response = await client.send(command);
      return response;
    } catch (error) {
      throw error;
    }
  }

  static async putParameter(region = 'us-east-1', parameter) {
    const client = new SSMClient({ region });
    
    const command = new PutParameterCommand(parameter);

    try {
      const response = await client.send(command);
      return response;
    } catch (error) {
      throw error;
    }
  }

  static async putParameters(region = 'us-east-1', parameters) {
    // AWS allows max 10 parameters per batch
    const batches = [];
    for (let i = 0; i < parameters.length; i += 10) {
      batches.push(parameters.slice(i, i + 10));
    }

    return Promise.all(
      batches.map(batch => 
        Promise.all(
          batch.map(param => this.putParameter(region, param))
        )
      )
    );
  }
}
