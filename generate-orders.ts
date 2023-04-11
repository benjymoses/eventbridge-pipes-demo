import {
  DynamoDBClient,
  BatchWriteItemCommand,
} from "@aws-sdk/client-dynamodb";

import { config } from "./config";

const NUMBER_TO_GENERATE = 25;
const STARTING_NUMBER = 1000;
const TABLE_NAME = config.tableName;

function buildOrderRequests() {
  const firstNames = [
    "Eesa",
    "Mohamed",
    "Rupert",
    "Stefan",
    "Sonny",
    "Oakley",
    "Ayaan",
    "Preston",
    "Jimmy",
    "Josiah",
    "Tyler",
    "Coby",
    "Alexander",
    "Sonny",
    "Freddy",
    "Caiden",
    "Jacob",
    "Tomos",
    "Tate",
    "Charlie",
    "Reuben",
    "Rudy",
    "Zachariah",
    "Marshall",
    "Simon",
    "Kai",
    "Jai",
    "Tommy",
    "Fergus",
    "Ahmad",
    "Lily-Mae",
    "Ayla",
    "Isabelle",
    "Minnie",
    "Kyla",
    "Courtney",
    "Esther",
    "Oliwia",
    "Aisha",
    "Frankie",
    "Lena",
    "Lilly-May",
    "Lillian",
    "Lottie",
    "Maisy",
    "Poppie",
    "Keeley",
    "Stephanie",
    "Iqra",
    "Maizie",
    "Aminah",
    "Hannah",
    "Belle",
    "Layla",
    "Kimberley",
    "Alisha",
    "Ava-Rose",
    "Esther",
    "Kayleigh",
    "Jade",
  ];
  const lastNames = [
    "Smith",
    "Johnson",
    "Williams",
    "Brown",
    "Jones",
    "Garcia",
    "Miller",
    "Davis",
    "Rodriguez",
    "Martinez",
    "Hernandez",
    "Lopez",
    "Gonzalez",
    "Wilson",
    "Anderson",
    "Thomas",
    "Taylor",
    "Moore",
    "Jackson",
    "Martin",
    "Lee",
    "Perez",
    "Thompson",
    "White",
    "Harris",
    "Sanchez",
    "Clark",
    "Ramirez",
    "Lewis",
    "Robinson",
    "Walker",
    "Young",
    "Allen",
    "King",
    "Wright",
    "Scott",
    "Torres",
    "Nguyen",
    "Hill",
    "Flores",
    "Green",
    "Adams",
    "Nelson",
    "Baker",
    "Hall",
    "Rivera",
    "Campbell",
    "Mitchell",
    "Carter",
    "Roberts",
  ];
  let returnArray = [];

  for (let i = 0; i < NUMBER_TO_GENERATE; i++) {
    const firstName = firstNames[Math.floor(Math.random() * firstNames.length)];
    const lastName = lastNames[Math.floor(Math.random() * lastNames.length)];

    const name = `${firstName} ${lastName}`;
    const PK = `${STARTING_NUMBER + i}`;
    const value = `${(Math.random() * 100).toFixed(2)}`;

    const requestObject = {
      PutRequest: {
        Item: {
          PK: { S: PK },
          name: { S: name },
          value: { N: value },
        },
      },
    };

    returnArray.push(requestObject);
  }

  return returnArray;
}

let orderRequests = buildOrderRequests();
//console.log(orderRequests);

const ddbClient = new DynamoDBClient({ region: "eu-west-1" });

const params = { RequestItems: { [TABLE_NAME]: orderRequests } };

const run = async () => {
  try {
    const data = await ddbClient.send(new BatchWriteItemCommand(params));
    console.log("Items inserted", data);
  } catch (err) {
    console.error("Error", err);
  }
};

run();
