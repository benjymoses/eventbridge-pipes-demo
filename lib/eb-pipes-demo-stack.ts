import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";

import {
  Table,
  AttributeType,
  BillingMode,
  StreamViewType,
} from "aws-cdk-lib/aws-dynamodb";
import { EventBus, Rule, Match } from "aws-cdk-lib/aws-events";
import * as targets from "aws-cdk-lib/aws-events-targets";
import * as stepfunctions from "aws-cdk-lib/aws-stepfunctions";
import { CfnPipe } from "aws-cdk-lib/aws-pipes";
import { LogGroup, RetentionDays } from "aws-cdk-lib/aws-logs";
import { Subscription, SubscriptionProtocol, Topic } from "aws-cdk-lib/aws-sns";
import {
  PolicyDocument,
  PolicyStatement,
  Role,
  ServicePrincipal,
} from "aws-cdk-lib/aws-iam";

import { config } from "../config";

export class EbPipesDemoStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // DynamoDB 'Orders' table'
    const ddbTable = new Table(this, "OrdersTable", {
      partitionKey: { name: "PK", type: AttributeType.STRING },
      billingMode: BillingMode.PAY_PER_REQUEST,
      stream: StreamViewType.NEW_IMAGE,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // Custom EventBridge Bus
    const eventBus = new EventBus(this, "OrdersBus", {});

    // EventBridge rule to catch-all to CloudWatch Logs (enable for demo purposes)
    const catchAllLogRule = new Rule(this, "CatchAllLogRule", {
      description:
        "Used to capture all events on the custom EventBridge bus for demo purposes",
      ruleName: "CatchAllLogRule",
      eventBus: eventBus,
      eventPattern: {
        source: Match.prefix(""),
      },
      targets: [
        new targets.CloudWatchLogGroup(
          new LogGroup(this, "CatchAllLogGroup", {
            logGroupName: "/aws/events/catchall-pipes-demo",
            retention: RetentionDays.THREE_DAYS,
            removalPolicy: cdk.RemovalPolicy.DESTROY,
          })
        ),
      ],
    });

    // Policy to allow EventBridge to write to CloudWatch Logs
    new PolicyDocument({
      statements: [
        new PolicyStatement({
          resources: [
            `arn:aws:logs:${process.env.CDK_DEFAULT_REGION}:${process.env.CDK_DEFAULT_ACCOUNT}:log-group:/aws/events/*:*"`,
          ],
          actions: ["logs:CreateLogStream", "logs:PutLogEvents"],
          principals: [
            new ServicePrincipal("events.amazonaws.com"),
            new ServicePrincipal("delivery.logs.amazonaws.com"),
          ],
        }),
      ],
    });

    // SNS topic and subscription for 'fraud' events to go to
    const snsTopic = new Topic(this, "FraudTopic");
    new Subscription(this, "FraudTeamSubscription", {
      protocol: SubscriptionProtocol.EMAIL,
      topic: snsTopic,
      endpoint: config.notificationEmail,
    });

    // Rule on EventBridge for high fraud scores
    const fraudRule = new Rule(this, "HighFraudRule", {
      description:
        "All orders with a Fraud Score higher than 80 go to fraud team email",
      eventBus: eventBus,
      eventPattern: {
        source: Match.prefix("fraudcheck.orderpipe"),
        detail: {
          fraudChecks: {
            fraudScore: Match.greaterThan(80),
          },
        },
      },
      targets: [new targets.SnsTopic(snsTopic)],
    });

    // Step Functions workflow to enrich contents of the pipe
    const enricherWorkflow = new stepfunctions.StateMachine(
      this,
      "EnricherWorkflowForFraud",
      {
        stateMachineType: stepfunctions.StateMachineType.EXPRESS,
        tracingEnabled: true,
        logs: {
          destination: new LogGroup(this, "OrderEnrichmentLogs", {
            retention: RetentionDays.THREE_DAYS,
            removalPolicy: cdk.RemovalPolicy.DESTROY,
          }),
          level: stepfunctions.LogLevel.ALL,
          includeExecutionData: true,
        },
        definition: stepfunctions.Chain.start(
          new stepfunctions.Map(this, "Map over events in batch", {
            maxConcurrency: 5,
          }).iterator(
            new stepfunctions.Pass(this, "Deserialise DynamoDB", {
              parameters: {
                eventData: {
                  eventID: stepfunctions.JsonPath.stringAt("$.eventID"),
                  eventName: stepfunctions.JsonPath.stringAt("$.eventName"),
                  approxDateTime: stepfunctions.JsonPath.numberAt(
                    "$.dynamodb.ApproximateCreationDateTime"
                  ),
                },
                orderData: {
                  orderNumber: stepfunctions.JsonPath.stringAt(
                    "$.dynamodb.NewImage.PK.S"
                  ),
                  customerName: stepfunctions.JsonPath.stringAt(
                    "$.dynamodb.NewImage.name.S"
                  ),
                  orderValue: stepfunctions.JsonPath.stringToJson(
                    stepfunctions.JsonPath.stringAt(
                      "$.dynamodb.NewImage.value.N"
                    )
                  ),
                },
              }, // Parameter creates new JSON object from contents of original input payload
            }).next(
              new stepfunctions.Pass(this, "Fraud Check", {
                resultPath: "$.fraudChecks",
                parameters: {
                  fraudScore: stepfunctions.JsonPath.mathRandom(1, 100),
                },
              })
            ) // This Pass state simulates calling out to an API or service that provides a Fraud Score back based on the orderData it was passed as input
          )
        ),
      }
    );

    // IAM Role for EventBridge Pipes
    const pipesRole = new Role(this, "pipesRole", {
      assumedBy: new ServicePrincipal("pipes.amazonaws.com"),
    });
    ddbTable.grantStreamRead(pipesRole);
    eventBus.grantPutEventsTo(pipesRole);
    enricherWorkflow.grantStartSyncExecution(pipesRole);

    // Filter Criteria for EventBridge Pipes source filtering
    const filterInsertsWithFields: CfnPipe.FilterCriteriaProperty = {
      filters: [
        {
          pattern:
            '{"eventName":["INSERT"],"dynamodb":{"NewImage":{"PK":{"S":[{"exists":true}]},"name":{"S":[{"exists":true}]},"value":{"N":[{"exists":true}]}}}}',
        },
      ],
    };

    // EventBridge Pipe to connect DynamoDB stream to EventBridge bus with in-line fraud checking enrichment by Step Functions.
    if (typeof ddbTable.tableStreamArn === "string") {
      // CfnPipe.source is a required Param and TS is unable to assert it won't be undefined
      const orderFraudPipe = new CfnPipe(this, "OrderFraudPipe", {
        roleArn: pipesRole.roleArn,
        source: ddbTable.tableStreamArn,
        target: eventBus.eventBusArn,
        enrichment: enricherWorkflow.stateMachineArn,
        sourceParameters: {
          dynamoDbStreamParameters: {
            startingPosition: "LATEST",
            batchSize: 5,
            onPartialBatchItemFailure: "AUTOMATIC_BISECT",
          },
          filterCriteria: filterInsertsWithFields,
        },
        targetParameters: {
          eventBridgeEventBusParameters: {
            detailType: "fraudcheck.rating",
            source: "fraudcheck.orderpipe",
          },
        },
      });
    }

    new cdk.CfnOutput(this, "DynamoDB Table", {
      value: `DynamoDB Table name for .env file is: ${ddbTable.tableName}`,
      description: "DynamoDB table name",
      exportName: "ddbTableName",
    });
  }
}
