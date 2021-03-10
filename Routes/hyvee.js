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

let LAST_NOTIFIED_PHARMACIES = [];
let METRICS = [];
let ERRORS = [];

module.exports = function(app) {
  app.get('/hyvee/metrics', (req, res) => {
    res.json(getAllMetrics());
  });
  app.get('/hyvee/metrics/:hours', (req, res) => {
    res.json(getMetrics(req.params.hours));
  });
}

function notifyVaccineFound(pharmacies) {
  if (JSON.stringify(pharmacies) !== JSON.stringify(LAST_NOTIFIED_PHARMACIES)) {
    notifyWithPushed(PUSHED_APP_KEY, PUSHED_APP_SECRET, PUSHED_CHANNELS.users, printVaccineFound(pharmacies));
    LAST_NOTIFIED_PHARMACIES = pharmacies;
  }
}

function searchPharmacies() {
    fetch({
      query: `
      query SearchPharmaciesNearPointWithCovidVaccineAvailability($latitude: Float!, $longitude: Float!, $radius: Int! = 10) {
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
      "latitude": 41.7317884,
      "longitude": -93.6001278
    }
    }).then(res => {
      let pharmacies = res.data.searchPharmaciesNearPoint;
      let pharmaciesWithVaccines = pharmacies.filter(p => p && p.location && p.location.isCovidVaccineAvailable);
      if (pharmaciesWithVaccines.length > 0) {
        notifyVaccineFound(pharmaciesWithVaccines);
        METRICS.push({vaccineFound: true, date: new Date()});
      } else {
        METRICS.push({vaccineFound: false, date: new Date()});
      }
    }).catch(err => {
      ERRORS.push({type: 'query', date: new Date()});
      let applicationError = 'Application Error';
      if (err.response) {
        if (err.response.status) {applicationError += `\n${err.response.status}`}
        if (err.response.data) {applicationError += `\n${err.response.data}`}
      }
      notifyWithPushed(PUSHED_APP_KEY, PUSHED_APP_SECRET, PUSHED_CHANNELS.dev, applicationError);
      console.log('error:', err.response ? err.response : err);
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
    ERRORS.push({type: 'pushed', date: new Date()});
    console.log(err.data ? err.data : err);
  });
}

function printVaccineFound(pharmacies) {
  let output = 'Vaccine Availible at Hyvee!';
  pharmacies.forEach(p => {
    output += `\n${p.location.address.line1} ${p.location.address.city}, ${p.location.address.state} ${p.location.address.zip}\n${p.distance} mi Away\n${p.location.covidVaccineEligibilityTerms}`;
  });
  return output;
}

function getMetrics(hours) {
  return ({
    vaccineFound: METRICS.filter(m => new Date() - m.date < (hours * 60 * 60 * 1000) && m.vaccineFound).length,
    vaccineNotFound: METRICS.filter(m => new Date() - m.date < (hours * 60 * 60 * 1000) && !m.vaccineFound).length,
    queryErrors: ERRORS.filter(m => new Date() - m.date < (hours * 60 * 60 * 1000) && type === 'query').length,
    pushedErrors: ERRORS.filter(m => new Date() - m.date < (hours * 60 * 60 * 1000) && type === 'pushed').length
  });
}

function getAllMetrics() {
  return ({
    vaccineFound: METRICS.filter(m => m.vaccineFound).length,
    vaccineNotFound: METRICS.filter(m => !m.vaccineFound).length,
    queryErrors: ERRORS.filter(m => type === 'query').length,
    pushedErrors: ERRORS.filter(m => type === 'pushed').length
  });
}

function deleteOldMetrics() {
  METRICS = METRICS.filter((m => new Date() - m.date < (24 * 60 * 60 * 1000)));
}

setInterval(() => {
  searchPharmacies();
}, 1 * 1000);