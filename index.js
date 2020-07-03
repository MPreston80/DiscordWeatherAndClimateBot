require('dotenv').config();
const Discord = require('discord.js'); 
const bot = new Discord.Client();
let request = require('request');
const mysql = require('mysql');
const df = require('dateformat');
const CronJob = require('cron').CronJob;
const PREFIX = '!';
let forecastHigh = 0;
let today = new Date();
let todayDate = today.getFullYear()+'-'+(today.getMonth()+1)+'-'+today.getDate();
let tempArray = [];
let dateArray = [];
let numDates;


bot.once('ready', () => {
    console.log('WeatherBot is online!');     
});


var connection = mysql.createConnection({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: "weather_data"
});

connection.connect(function(err) {
  if (err) {
    console.error('error connecting: ' + err.stack);
    return;
  }
 
  console.log('connected as id ' + connection.threadId);
});

//See https://www.npmjs.com/package/cron for info on the cron node module. The function passed as an argument will be executed at 8 a.m. every day of 
//every month. 
var job = new CronJob('00 00 08 * * *', function() {
  const options = {
    url: 'https://api.weather.gov/gridpoints/DTX/39,60/forecast',
    headers: {
      'User-Agent': process.env.USERAGENT
    }
  };
  
  function callback(error, response, body) {
    if (!error && response.statusCode == 200) {
      const forecast = JSON.parse(body);
      forecastHigh = forecast.properties.periods[0].temperature;     
      connection.query(`INSERT INTO weather_data.weather (date, forecastMax) VALUES ('${todayDate}','${forecastHigh}')`,  function (error, results, fields) {
        
       });          
    }
  }
  request(options, callback);  
  
}, null, true, 'America/Detroit');
job.start();

bot.on('message', message=>{ 
  let args = message.content.substring(PREFIX.length).split(" ");


switch(args[0])
{
  case 'recordForecast':
    
    connection.query(`SELECT recordID FROM weather WHERE date = '${todayDate}'`, function (error, results, fields){
      let len = results.length;
      if(len>0)
      {
        message.reply("The forecast high temp has already been recorded for today.");               
      }
      else
      {
        const options = {
          url: 'https://api.weather.gov/gridpoints/DTX/39,60/forecast',
          headers: {
            'User-Agent': process.env.USERAGENT
          }
        };
        
        function callback(error, response, body) {
          if (!error && response.statusCode == 200) {
            const forecast = JSON.parse(body);
            forecastHigh = forecast.properties.periods[0].temperature;     
            connection.query(`INSERT INTO weather_data.weather (date, forecastMax) VALUES ('${todayDate}','${forecastHigh}')`,  function (error, results, fields) {
              message.reply("The high temp for today has been recorded in the database.");
             });                
          }
        }
        request(options, callback);
      }
    });
  break;
  case 'recordHistoricalData':
    connection.query(`SELECT date FROM weather WHERE actualMax IS NULL`, function (error, results, fields){
      let len1 = results.length;
      if(len1===0)
      {
        message.reply("The database is up to date, there is no data to record.");
      }
      else
      {
        for(var i = 0;i<len1;i++)
        {
          dateArray.push(df(results[i].date, "isoDate"));
        }
        console.log("This is the date array: " + dateArray);
        numDates = dateArray.length;

        const options1 = {
          url: `https://www.ncdc.noaa.gov/cdo-web/api/v2/data?units=standard&datasetid=GHCND&stationid=GHCND:USW00014826&startdate=${dateArray[0]}&enddate=${dateArray[numDates-1]}&limit=200`,
          headers: {
            'token': process.env.NCDCNOAATOKEN
          }
        };
        
        function callback1(error, response, body) {
          if (!error && response.statusCode == 200) {
            const info = JSON.parse(body);
            let numObjects = Object.keys(info.results).length;
            for(var i = 0;i<numObjects;i++)
            {
              if(info.results[i].datatype==='TMAX')
              {
                var obj = new Object();
                obj.highTemp = info.results[i].value;
                obj.highTempDate = df(info.results[i].date, "isoDate");
                tempArray.push(obj);
              }
            }
            
            if(tempArray.length>0)
            {
              var tempLen = tempArray.length;
              for(var j = 0;j<tempLen;j++)
              {
                connection.query(`UPDATE weather_data.weather SET actualMax = ${tempArray[j].highTemp} WHERE date = '${tempArray[j].highTempDate}'`,  function (error, results, fields){
                  console.log("Error in updating weather table: " + error);
                });
              }            
            }
        }
      }

        request(options1, callback1);      
    }
    });
};
});

bot.login(process.env.TOKEN);