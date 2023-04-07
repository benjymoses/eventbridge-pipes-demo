const jp = require('jsonpath')
const cfnStack = require('../cdk.out/EbPipesDemoStack.template.json')
const tableName = jp.paths(cfnStack, '$..Resources[?(@.Type=="AWS::DynamoDB::Table")]')[0][2];

console.log(tableName);
