const { createApolloFetch } = require('apollo-fetch');
const axios = require('axios');

const fetch = createApolloFetch({
  uri: 'https://www.hy-vee.com/my-pharmacy/api/graphql'
});

const PUSHED_APP_KEY = 'UIAnaCTe1rbX3PRr754y';
const PUSHED_APP_SECRET = 'F89R97wp2hS2j4OW9DkkhoZ5ghvb5tx3zv6pBDeVkehvJ6RsbT1xvw6UGxPwYN7U';
const PUSHED_CHANNELS = {
  users: 'c446ye',
  dev: '1XlSHa'
}

let NEW_PHARMACY_RECORDS = [[], [], []];
let OLD_PHARMACY_RECORDS = [[], [], []];
let VACCINE_FOUND = 0;
let VACCINE_NOT_FOUND = 0;
let QUERY_ERROR = 0;
let PUSHED_ERROR = 0;
let LAST_5_ERRORS = [{}, {}, {}, {}, {}]
let LAST_VACCINE_FOUND_TIME = '';
let LAST_VACCINE_NOT_FOUND_TIME = '';

module.exports = function(app) {
  app.get('/hyvee/metrics', (req, res) => {
    res.json(getAllMetrics());
  });

  app.get('/hyvee/errors', (req, res) => {
    res.json(LAST_5_ERRORS);
  });
}

function notifyVaccineFound(pharmacies) {
  shiftPharmacyRecordArrays(pharmacies);
  if (notificationLowPassFilter()) {
    if (notificationLossOfPharmacyFilter()) {
      notifyWithPushed(PUSHED_APP_KEY, PUSHED_APP_SECRET, PUSHED_CHANNELS.users, printVaccineFound(pharmacies));
    }
  }
}

function shiftPharmacyRecordArrays(pharmacies) {
  NEW_PHARMACY_RECORDS.push(pharmacies);
  OLD_PHARMACY_RECORDS.push(NEW_PHARMACY_RECORDS.shift());
  OLD_PHARMACY_RECORDS.shift();
}

function notificationLowPassFilter() {
  if (pharmacyArrayHomogenous(NEW_PHARMACY_RECORDS)) {
    if (pharmacyArrayHomogenous(OLD_PHARMACY_RECORDS)) {
      if (!pharmacyArraysEqual(OLD_PHARMACY_RECORDS[0], NEW_PHARMACY_RECORDS[0])) {
        return true;
      }
    }
  }
  return false
}

function pharmaciesEqual(a, b) {
  return a.location.locationId === b.location.locationId;
}

function pharmacyArraysEqual(arrayA, arrayB) {
  return arrayA.length === arrayB.length && arrayA.every(a => arrayB.some(b => pharmaciesEqual(a, b)));
}

function pharmacyArrayHomogenous(array) {
  return array.every(pharmacyArray => pharmacyArraysEqual(pharmacyArray, array[0]))
}

function notificationLossOfPharmacyFilter() {
  const newPharmacyRecrord = NEW_PHARMACY_RECORDS[0];
  const oldPharmacyRecord = OLD_PHARMACY_RECORDS[0];
  let newUniquePharmacyRecords = newPharmacyRecrord.filter(n => oldPharmacyRecord.every(o => !pharmaciesEqual(n, o)));
  if (newUniquePharmacyRecords.length > 0) {
    return true;
  }
}

function searchPharmacies() {
    fetch({
      query: `
      query SearchPharmaciesNearPointWithCovidVaccineAvailability($latitude: Float!, $longitude: Float!, $radius: Int! = 50) {
        searchPharmaciesNearPoint(latitude: $latitude, longitude: $longitude, radius: $radius) {
          distance
          location {
            locationId
            name
            nickname
            phoneNumber
            businessCode
            isCovidVaccineAvailable
            covidVaccineEligibilityTerms
            address {
              line1
              line2
              city
              state
              zip
              latitude
              longitude
              __typename
            }
            __typename
          }
          __typename
        }
      }
    `,
    variables: {
      "radius": 50,
      // "latitude": 41.7317884,    // Ankeny 
      // "longitude": -93.6001278,  // Ankeny
      "latitude": 42.0494674,         // Marshaltown
      "longitude": -92.90803749999999 // Marshaltown
    }
    }).then(res => {
      let pharmacies = res.data.searchPharmaciesNearPoint;
      let pharmaciesWithVaccines = pharmacies && pharmacies.filter(p => p && p.location && p.location.isCovidVaccineAvailable);
      if (pharmaciesWithVaccines.length > 0) {
        notifyVaccineFound(pharmaciesWithVaccines);
        VACCINE_FOUND += 1
        LAST_VACCINE_FOUND_TIME = new Date();
      } else {
        VACCINE_NOT_FOUND += 1
        LAST_VACCINE_NOT_FOUND_TIME = new Date();
      }
    }).catch(err => {
      QUERY_ERROR += 1;
      let applicationError = `Application Error\n${err}`;
      // notifyWithPushed(PUSHED_APP_KEY, PUSHED_APP_SECRET, PUSHED_CHANNELS.dev, applicationError);
      LAST_5_ERRORS.push({date: new Date(), error: applicationError});
      LAST_5_ERRORS.shift();
      console.log(applicationError);
    });
}

function notifyWithPushed(appKey, appSecret, targetAlias, content) {
  axios.post('https://api.pushed.co/1/push', {
    app_key: appKey,
    app_secret: appSecret,
    target_type: 'channel',
    target_alias: targetAlias,
    content: content
  }).then(res => {
    console.log(res.data.response.message);
    console.log(content);
    console.log('-----------------------------');
  }).catch(err => {
    PUSHED_ERROR += 1;
    console.log(err.data.message);
  });
}

function printVaccineFound(pharmacies) {
  let output = 'Vaccine Availible at Hyvee!';
  pharmacies.forEach(p => {
    output += `\n${p.location.address.zip} | ${Math.round(p.distance)} mi`;
    // output += `\n${p.location.address.line1} ${p.location.address.city}, ${p.location.address.state} ${p.location.address.zip}\n${p.distance} mi Away\n${p.location.covidVaccineEligibilityTerms}`;
  });
  return output;
}

function getAllMetrics() {
  return ({
    vaccineFound: VACCINE_FOUND,
    vaccineNotFound: VACCINE_NOT_FOUND,
    queryErrors: QUERY_ERROR,
    pushedErrors: PUSHED_ERROR,
    lastVaccineFound: LAST_VACCINE_FOUND_TIME ? LAST_VACCINE_FOUND_TIME.toLocaleString("en-US", {timeZone: "America/New_York"}) : 'none',
    lastVaccineNotFound: LAST_VACCINE_NOT_FOUND_TIME ? LAST_VACCINE_NOT_FOUND_TIME.toLocaleString("en-US", {timeZone: "America/New_York"}) : 'none'
  });
}

setInterval(() => {
  searchPharmacies();
}, 1 * 1000);