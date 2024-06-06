const express = require("express");
const router = express.Router();
const Driver = require("../models/DriverRegister");
const Booking = require("../models/bookingInfo");
const SendRequest = require("../models/SendRequest");

function haversine(lat1, lon1, lat2, lon2) {
  const R = 6371; // Radius of the Earth in kilometers
  const dLat = ((lat2 - lat1) * Math.PI) / 180; // Convert degrees to radians
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const distance = R * c; // Distance in kilometers
  return distance;
}

function findNearestUser(users, targetLat, targetLon) {
  let nearestUser = null;
  let minDistance = Infinity;

  users.forEach((user) => {
    const userLat = user.current_latitude;
    const userLon = user.current_longitude;
    const distance = haversine(targetLat, targetLon, userLat, userLon);
    if (distance < minDistance) {
      minDistance = distance;

      nearestUser = { id: user?._id, distance: distance };
    }
  });

  return nearestUser;
}


async function sendPushNotification(token, message) {
  try {
    const serverKey = "AAAArvXcJE4:APA91bG4SOclqa1ulWwTE8J6rtLagmhGMmy2dl4kTq9ASbrcm-uHKZmx3xD50ZR4_D86vCe5UIuDkvhAx-q6cX1BP6dz76cp0m3owUBIcSObyQIjKnp8qYZGLKF14YZnsn4Vhm-pqazT";
    const url = "https://fcm.googleapis.com/fcm/send";

    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `key=${serverKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        to: token,
        notification: {
          title: "Ride Update",
          body: message,
          sound: "custom_sound.mp3",
          android_channel_id: "myapp_notification",
        },
      }),
    });

    return response.json();
  } catch (error) {
    console.error("Error sending push notification:", error);
    throw error;
  }
}

// POST /api/user/details
router.post("/driver", async (req, res) => {
  try {
    const { user_id, ride_id, logitute, latitude } = req.body;
    if (!user_id || !ride_id || !logitute || !latitude)
      return res
        .status(400)
        .json({ status: "error", message: "All fields are required !" });

    const DriverData = await Driver.find({ status: "approved" });
    
    if (DriverData.length === 0) {
      return res.status(404).json({ status: "error", message: "No drivers found." });
    }

    let nearDriver = findNearestUser(DriverData, latitude, logitute);

    let data = await Booking.findOne({ RideId: ride_id });
    data.DriverID = nearDriver.id;
    let newRecord = new SendRequest({
      UserId: user_id,
      RideId: ride_id,
      DriverID: nearDriver.id,
    });
    let SendDrivers = [nearDriver.id];
    let insertData = await newRecord.save();
    await data.save();

    // Send push notification to the driver
    const driver = await Driver.findById(nearDriver.id);
    if (driver && driver.token) {
      const message = "New ride request available";
      await sendPushNotification(driver.token, message);
    }

    let timeout = setInterval(checkDriver, 40000);
    async function checkDriver() {
      let findDriverStatus = await SendRequest.findOne({
        _id: insertData?._id,
      });
      if (findDriverStatus?.status != "pending") {
        clearInterval(timeout);
      } else {
        let newData = DriverData.filter((el) => !SendDrivers.includes(el._id));
        let newNearsDriver = findNearestUser(newData, latitude, logitute);
        if (!newNearsDriver || !newNearsDriver.id) return clearInterval(timeout);
        findDriverStatus.DriverID = newNearsDriver.id;
        data.DriverID = newNearsDriver.id;
        SendDrivers.push(newNearsDriver.id);

        // Send push notification to the new nearest driver
        const newDriver = await Driver.findById(newNearsDriver.id);
        if (newDriver && newDriver.token) {
          const message = "New Ride Request Assign You Can Accept This Ride ?";
          await sendPushNotification(newDriver.token, message);
        }
      }
      await findDriverStatus.save();
      await data.save();
    }

    return res.status(200).json({ status: "success", data });

    // jjkddjsdkfjsdfjskld
  } catch (error) {
    console.error(error);
    return res.status(500).json({ status: "error", message: "Internal Server Error" });
  }
});

module.exports = router;