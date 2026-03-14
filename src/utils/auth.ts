import { verifyToken } from "@clerk/backend";
import { APIGatewayProxyEvent } from 'aws-lambda';

export const verifyAuthToken = async (event: APIGatewayProxyEvent): Promise<any> => {
    const authHeader = event.headers.Authorization || event.headers.authorization;

    if (!authHeader) {
        throw new Error('Missing Authorization header');
    }

    const token = authHeader.replace('Bearer ', '');

    try {

      const extractedTokenData = await verifyToken(token, {
        jwtKey: process.env.CLERK_JWT_KEY,
        authorizedParties: process.env.CLERK_AUTHORIZED_PARTIES?.split(','),
      });
      console.log('extractedTokenData', extractedTokenData);
      return extractedTokenData;

    } catch(error) {

      console.log(error);
      console.error('Error verifying token:');
      throw new Error('Invalid Authorization token');

    }
    
};
