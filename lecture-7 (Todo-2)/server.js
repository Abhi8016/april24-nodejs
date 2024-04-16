const express = require("express");
require("dotenv").config();
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const session = require("express-session");
const mongodbSession = require("connect-mongodb-session")(session);

//file-import
const { userDataValidation, isEmailRgex } = require("./utils/authUtils");
const userModel = require("./models/userModel");
const { isAuth } = require("./middleware/isAuth");

//constants
const app = express();
const PORT = process.env.PORT || 8000;
const store = new mongodbSession({
  uri: process.env.MONGO_URI,
  collection: "sessions",
});
const Schema = mongoose.Schema;

//db connection
mongoose
  .connect(process.env.MONGO_URI)
  .then(() => {
    console.log("Mongodb connected successfully");
  })
  .catch((err) => {
    console.log(err);
  });

//middlewares
app.set("view engine", "ejs");
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

app.use(
  session({
    secret: process.env.SECRET_KEY,
    store: store,
    resave: false,
    saveUninitialized: false,
  })
);

app.get("/", (req, res) => {
  return res.render("server");
});

app.get("/register", (req, res) => {
  return res.render("registerPage");
});

app.post("/register-user", async (req, res) => {
  const { name, email, username, password } = req.body;

  //data validation
  try {
    await userDataValidation({ name, username, password, email });
  } catch (error) {
    return res.send({
      status: 400,
      error: error,
    });
  }

  try {
    //check is email exist
    const isEmailExist = await userModel.findOne({ email });
    if (isEmailExist) {
      return res.status(400).json("Email already exist");
    }

    //check if username exist

    const isUsernameExist = await userModel.findOne({ username });
    if (isUsernameExist) {
      return res.status(400).json("Username already exist");
    }

    //hashing of the password
    const hashedPassword = await bcrypt.hash(
      password,
      Number(process.env.SALT)
    );

    const userObj = new userModel({
      name: name,
      email: email,
      username: username,
      password: hashedPassword,
    });

    //store the data
    const userDb = await userObj.save();

    return res.redirect("/login");
  } catch (error) {
    return res.send({
      status: 500,
      message: "Internal server error",
      error: error,
    });
  }
});

app.get("/login", (req, res) => {
  return res.render("loginPage");
});

app.post("/login-user", async (req, res) => {
  console.log(req.body);

  const { loginId, password } = req.body;

  if (!loginId || !password) return res.status(400).json("Missing credentials");

  let userDb;
  try {
    //find the user with loginId
    if (isEmailRgex({ str: loginId })) {
      userDb = await userModel.findOne({ email: loginId });
    } else {
      userDb = await userModel.findOne({ username: loginId });
    }
    console.log(userDb);

    if (!userDb) {
      return res.send({
        status: 400,
        message: "User not found, please register first",
      });
    }

    //compare the password

    const isMatched = await bcrypt.compare(password, userDb.password);

    if (!isMatched) {
      return res.send({
        status: 400,
        message: "Password is incorrect",
      });
    }

    //session base auth

    console.log(req.session);
    req.session.isAuth = true;
    req.session.user = {
      username: userDb.username,
      email: userDb.email,
      userId: userDb._id, //BSON error userDb._id.toString()
    };

    return res.redirect("/dashboard");
  } catch (error) {
    return res.send({
      status: 500,
      message: "Internal server error",
      error: error,
    });
  }
});

app.get("/dashboard", isAuth, (req, res) => {
  return res.render("dashboard");
});

app.post("/logout", isAuth, (req, res) => {
  console.log(req.session);
  req.session.destroy((err) => {
    if (err) throw err;
    console.log(req.session);

    return res.redirect("/login");
  });
});

app.post("/logout_from_all_devices", isAuth, async (req, res) => {
  console.log(req.session);

  const username = req.session.user.username;
  const sessionSchema = new Schema({ _id: String }, { strict: false });
  const sessionModel = mongoose.model("session", sessionSchema);

  try {
    const deleteDb = await sessionModel.deleteMany({
      "session.user.username": username,
    });

    console.log(deleteDb);

    return res.send({
      status: 200,
      message: "Logout from all devices successfull",
      data: deleteDb,
    });
  } catch (error) {
    return res.send({
      status: 500,
      error: error,
    });
  }
});

app.listen(PORT, () => {
  console.log("Server is running:");
  console.log(`http://localhost:${PORT}/`);
});
