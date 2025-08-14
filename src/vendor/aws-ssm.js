import { 
  DeleteParameterCommand,
  GetParametersByPathCommand,
  PutParameterCommand,
  SSMClient, 
} from '@aws-sdk/client-ssm';


export default class AwsSsm {
  static async getParametersByPath(region = 'us-east-1', path) {
    const client = new SSMClient({ region });
    
    let allParameters = [];
    let nextToken = undefined;
    
    // Paginate through all results (AWS returns max 10 by default)
    do {
      const command = new GetParametersByPathCommand({
        Path: path,
        Recursive: true,
        WithDecryption: true,
        MaxResults: 10, // AWS SSM max is 10 per request
        NextToken: nextToken
      });

      try {
        const response = await client.send(command);
        if (response.Parameters) {
          allParameters = allParameters.concat(response.Parameters);
        }
        nextToken = response.NextToken;
      } catch (error) {
        throw error;
      }
    } while (nextToken);
    
    return {
      Parameters: allParameters
    };
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

  static async deleteParameter(region = 'us-east-1', name) {
    const client = new SSMClient({ region });
    
    const command = new DeleteParameterCommand({
      Name: name
    });

    try {
      const response = await client.send(command);
      return response;
    } catch (error) {
      throw error;
    }
  }
}
