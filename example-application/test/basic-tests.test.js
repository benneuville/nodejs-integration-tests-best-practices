const request = require("supertest");
const sinon = require("sinon");
const nock = require("nock");
const { initializeWebServer, stopWebServer } = require("../api-under-test");
const mailer = require("../libraries/mailer");
const OrderRepository = require("../data-access/order-repository");

let expressApp;

beforeAll(async (done) => {
  // ️️️✅ Best Practice: Place the backend under test within the same process
  expressApp = await initializeWebServer();

  // ️️️✅ Best Practice: Ensure that this component is isolated by preventing unknown calls
  nock.disableNetConnect();
  nock.enableNetConnect("127.0.0.1");

  done();
});

beforeEach(() => {
  nock("http://localhost/user/").get(`/1`).reply(200, {
    id: 1,
    name: "John",
  });
});

afterEach(() => {
  nock.cleanAll();
  sinon.restore();
});

afterAll(async (done) => {
  // ️️️✅ Best Practice: Clean-up resources after each run
  await stopWebServer();
  nock.enableNetConnect();
  done();
});

// ️️️✅ Best Practice: Structure tests
describe("/api", () => {
  describe("GET /order", () => {
    test("When asked for an existing order, Then should retrieve it and receive 200 response", async () => {
      //Arrange
      const orderToAdd = {
        userId: 1,
        productId: 2,
        mode: "approved",
      };
      const {
        body: { id: addedOrderId },
      } = await request(expressApp).post("/order").send(orderToAdd);

      //Act
      const getResponse = await request(expressApp).get("/order/" + addedOrderId);

      //Assert
      expect(getResponse).toMatchObject({
        status: 200,
        body: {
          userId: 1,
          productId: 2,
          mode: "approved",
        },
      });
    });

    test("When asked for an non-existing order, Then should receive 404 response", async () => {
      //Arrange
      const nonExistingOrderId = -1;

      //Act
      const getResponse = await request(expressApp).get("/order/" + nonExistingOrderId);

      //Assert
      expect(getResponse.status).toBe(404);
    });
  });

  describe("POST /orders", () => {
    test("When adding a new valid order, Then should get back 200 response", async () => {
      //Arrange
      const orderToAdd = {
        userId: 1,
        productId: 2,
        mode: "approved",
      };

      //Act
      const receivedAPIResponse = await request(expressApp).post("/order").send(orderToAdd);

      //Assert
      expect(receivedAPIResponse).toMatchObject({
        status: 200,
        body: {
          mode: "approved",
        },
      });
    });

    test("When adding a new valid order, Then should be able to retrieve it", async () => {
      //Arrange
      const orderToAdd = {
        userId: 1,
        productId: 2,
        mode: "approved",
      };

      //Act
      const {
        body: { id: addedOrderId },
      } = await request(expressApp).post("/order").send(orderToAdd);

      //Assert
      const { body, status } = await request(expressApp).get("/order/" + addedOrderId);

      expect({
        body,
        status,
      }).toMatchObject({
        status: 200,
        body: {
          id: addedOrderId,
          userId: 1,
          productId: 2,
        },
      });
    });

    test("When adding a new valid order, Then an email should be send to admin", async () => {
      //Arrange
      process.env.SEND_MAILS = "true";

      // ️️️✅ Best Practice: Intercept requests for 3rd party services to eliminate undesired side effects like emails or SMS
      // ️️️✅ Best Practice: Specify the body when you need to make sure you call the 3rd party service as expected
      const scope = nock("https://mailer.com")
        .post("/send", {
          subject: /^(?!\s*$).+/,
          body: /^(?!\s*$).+/,
          recipientAddress: /^[\w-\.]+@([\w-]+\.)+[\w-]{2,4}$/,
        })
        .reply(202);

      const orderToAdd = {
        userId: 1,
        productId: 2,
        mode: "approved",
      };

      //Act
      await request(expressApp).post("/order").send(orderToAdd);

      //Assert
      // ️️️✅ Best Practice: Assert that the app called the mailer service appropriately
      expect(scope.isDone()).toBe(true);
    });

    test("When adding an order without specifying product, stop and return 400", async () => {
      //Arrange
      const orderToAdd = {
        userId: 1,
        mode: "draft",
      };

      //Act
      const orderAddResult = await request(expressApp).post("/order").send(orderToAdd);

      //Assert
      expect(orderAddResult.status).toBe(400);
    });

    test("When the user does not exist, return 404 response", async () => {
      //Arrange
      nock("http://localhost/user/").get(`/7`).reply(404, {
        message: "User does not exist",
        code: "nonExisting",
      });
      const orderToAdd = {
        userId: 7,
        productId: 2,
        mode: "draft",
      };

      //Act
      const orderAddResult = await request(expressApp).post("/order").send(orderToAdd);

      //Assert
      expect(orderAddResult.status).toBe(404);
    });

    test("When order failed, send mail to admin", async () => {
      //Arrange
      process.env.SEND_MAILS = "true";
      // ️️️✅ Best Practice: Intercept requests for 3rd party services to eliminate undesired side effects like emails or SMS
      // ️️️✅ Best Practice: Specify the body when you need to make sure you call the 3rd party service as expected
      const scope = nock("https://mailer.com")
        .post("/send", {
          subject: /^(?!\s*$).+/,
          body: /^(?!\s*$).+/,
          recipientAddress: /^[\w-\.]+@([\w-]+\.)+[\w-]{2,4}$/,
        })
        .reply(202);

      sinon.stub(OrderRepository.prototype, "addOrder").throws(new Error("Unknown error"));
      const orderToAdd = {
        userId: 1,
        productId: 2,
        mode: "approved",
      };

      //Act
      await request(expressApp).post("/order").send(orderToAdd);

      //Assert
      // ️️️✅ Best Practice: Assert that the app called the mailer service appropriately
      expect(scope.isDone()).toBe(true);
    });
  });
});