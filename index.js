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
let deviation;
let avgHigh;
let ninetyDays;
let numDates;
let acc;
let extremeAnomaly;
let maxTemp;
var lastMonth = "0"+ today.getMonth();

var month = new Array();
month[0] = "January";
month[1] = "February";
month[2] = "March";
month[3] = "April";
month[4] = "May";
month[5] = "June";
month[6] = "July";
month[7] = "August";
month[8] = "September";
month[9] = "October";
month[10] = "November";
month[11] = "December";


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
var job = new CronJob('00 15 07 * * *', function() {
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
      console.log(forecastHigh);    
       connection.query(`INSERT INTO weather_data.weather (date, forecastMax) VALUES ('${todayDate}','${forecastHigh}')`,  function (error, results, fields) {
        
        }); 
        //Previously line 78 sent a message to the discord server every day that the high temp had been recorded. Seemed unecessary and spam-y
        //Now if the forecast high temp wasn't recorded because of API issues, the bot will DM me (line 109).
        //bot.channels.cache.get('664657523885998102').send('Forecast has been recorded for ' + (today.getMonth() + 1)+ '/' + today.getDate());      
    }
    
  }
  request(options, callback);  

}, null, true, 'America/Detroit');
job.start();


//redoJob queries the database to see that the forecast daily high was already recorded by the "job" cron job (lines 61-86). There can occasionally be issues 
//with the API not retrieving data from the upstream source. If no record is found for the current day, another API call is made to get the 
//daily forecasted high temperature.
var redoJob = new CronJob('00 15 09 * * *', function() {
  connection.query(`SELECT forecastMax FROM weather_data.weather WHERE date = '${todayDate}'`, function (error, results, fields){ 
    if(results.length===0){
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
            if(error)
            {
              bot.users.cache.get('618448794270302218').send('You need to manually enter the high temp. API issues');//Argument to get() is my user ID.
            }
            }); 
            //bot.channels.cache.get('664657523885998102').send('Forecast has been recorded for ' + (today.getMonth() + 1)+ '/' + today.getDate());      
        }
        
      }
      request(options, callback);

    }
  });
}, null, true, 'America/Detroit');
redoJob.start();

//Loopdemo() is a stored procedure that will calculate the values for the forecastAccuracy and deviationfromAverage columns in the weather table.
var job1 = new CronJob('00 00 11 08 * *', function() {
  connection.query(`CALL loopdemo()`, function (error, results, fields){  
    if(error)
    {
      bot.users.cache.get('618448794270302218').send("There was an error calling the loopdemo stored procedure.");
    }   
  });
}, null, true, 'America/Detroit');
job1.start();

//job2 is a cronjob object that retrieves historical high temps for rows in the weather table that currently have a NULL value in the actualMax column.
var job2 = new CronJob('00 00 08 * * 0', function() { //Cronjob executes at 8:00 a.m. every Sunday.
  connection.query(`SELECT date FROM weather WHERE actualMax IS NULL`, function (error, results, fields){
    let len1 = results.length;
    
      for(var i = 0;i<len1;i++)
      {
        dateArray.push(df(results[i].date, "isoDate"));
      }
      numDates = dateArray.length;

      const options2 = {
        url: `https://www.ncdc.noaa.gov/cdo-web/api/v2/data?units=standard&datasetid=GHCND&stationid=GHCND:USW00014826&startdate=${dateArray[0]}&enddate=${dateArray[numDates-1]}&limit=200`,
        headers: {
          'token': process.env.NCDCNOAATOKEN
        }
      };
      
      function callback2(error, response, body) {
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
                if(error)
                {
                  bot.users.cache.get('618448794270302218').send("There was an issue recording historical high temp data.");
                }
                
              });
            }            
          }
      }
    }
      request(options2, callback2);  
  });
}, null, true, 'America/Detroit');
job2.start();

//job3 is a cron job object which populates the monthly_reports table with stats about the previous months weather. 
var job3 = new CronJob('00 00 11 10 * *', function() {
  connection.query(`SELECT AVG(deviationfromAverage) as deviation from weather_data.weather WHERE date LIKE '%-${lastMonth}-%'`, function (error, results, fields){ 
    if (error) throw error;
    deviation = results[0].deviation;
    connection.query(`INSERT INTO weather_data.monthly_reports (month, year, deviation_from_average) VALUES ('${month[today.getMonth()-1]}', '${today.getFullYear()}', '${deviation}') `, function (error, results, fields){
      if(error) throw error;
    });
  });   


  connection.query(`SELECT AVG(actualMax) as avgHigh from weather_data.weather WHERE date LIKE '%-${lastMonth}-%'`, function (error, results, fields){
    if (error) throw error;
    avgHigh = results[0].avgHigh;
    connection.query(`UPDATE weather_data.monthly_reports SET monthly_average = ${avgHigh} WHERE month = '${month[today.getMonth()-1]}' AND year = '${today.getFullYear()}'`, function (error, results, fields){
      if(error) throw error;
       });         
  });
  

 connection.query(`SELECT COUNT(*) AS ninetyDegDays FROM weather_data.weather WHERE actualMax > 89 AND date LIKE '%-${lastMonth}-%'`, function (error, results, fields){
   if(error) throw error;
   ninetyDays = results[0].ninetyDegDays;
   connection.query(`UPDATE weather_data.monthly_reports SET days_greaterthan_90 = ${ninetyDays} WHERE month = '${month[today.getMonth()-1]}' AND year = ${today.getFullYear()}`, function (error, results, fields){
    if(error) throw error;
     });    
 });

 connection.query(`SELECT MAX(actualMax) as maxTemp FROM weather_data.weather;`, function (error, results, fields){
   if(error) throw error;
   maxTemp = results[0].maxTemp;
   connection.query(`UPDATE weather_data.monthly_reports SET max_temp = ${maxTemp} WHERE month = '${month[today.getMonth()-1]}' AND year = ${today.getFullYear()}`, function (error, results, fields){
    if(error) throw error;
     });    
});
  
connection.query(`SELECT COUNT(*) as numDays FROM weather_data.weather WHERE deviationfromAverage > 19 AND date LIKE '%-${lastMonth}-%'`, function (error, results, fields){
  if(error) throw error;
  extremeAnomaly = results[0].numDays;
  connection.query(`UPDATE weather_data.monthly_reports SET large_anomaly = ${extremeAnomaly} WHERE month = '${month[today.getMonth()-1]}' AND year = ${today.getFullYear()}`, function (error, results, fields){
    if(error) throw error;
     });    
});

connection.query(`SELECT AVG(forecastAccuracy) as accuracy from weather_data.weather WHERE date LIKE '%-${lastMonth}-%'`, function (error, results, fields){
  if(error) throw error;
  acc = results[0].accuracy;
  connection.query(`UPDATE weather_data.monthly_reports SET forecast_accuracy = ${acc} WHERE month = '${month[today.getMonth()-1]}' AND year = ${today.getFullYear()}`, function (error, results, fields){
    if(error) throw error;
  }); 
});

bot.channels.cache.get('664657523885998102').send('Monthly report has been generated for ' + month[today.getMonth()-1]);

}, null, true, 'America/Detroit');
job3.start();


bot.on('message', message=>{ 
  let args = message.content.substring(PREFIX.length).split(" ");
  

switch(args[0])
{
  case 'recordForecast'://This command records the forecast high temp for the day if both of the cron jobs were not able to
                        //record the data due to API issues. 
    
    connection.query(`SELECT recordID FROM weather WHERE date = '${todayDate}'`, function (error, results, fields){
      let len = results.length;
      if(len>0)
      {
        message.reply("The forecast high temp has already been recorded for today.");               
      }
      else
      {
        const xoptions = {
          url: 'https://api.weather.gov/gridpoints/DTX/39,60/forecast',
          headers: {
            'User-Agent': process.env.USERAGENT
          }
        };
        
        function xcallback(error, response, body) {
          if (!error && response.statusCode == 200) {
            const forecast = JSON.parse(body);
            forecastHigh = forecast.properties.periods[0].temperature;     
            connection.query(`INSERT INTO weather_data.weather (date, forecastMax) VALUES ('${todayDate}','${forecastHigh}')`,  function (error, results, fields) {
              message.reply("The high temp for today has been recorded in the database.");
             });                
          }
        }
        request(xoptions, xcallback);
      }
    });
  break;
//   case 'recordHistoricalData':
//     connection.query(`SELECT date FROM weather WHERE actualMax IS NULL`, function (error, results, fields){
//       let len1 = results.length;
//       if(len1===0)
//       {
//         message.reply("The database is up to date, there is no data to record.");
//       }
//       else
//       {
//         for(var i = 0;i<len1;i++)
//         {
//           dateArray.push(df(results[i].date, "isoDate"));
//         }
//         console.log("This is the date array: " + dateArray);
//         numDates = dateArray.length;

//         const options1 = {
//           url: `https://www.ncdc.noaa.gov/cdo-web/api/v2/data?units=standard&datasetid=GHCND&stationid=GHCND:USW00014826&startdate=${dateArray[0]}&enddate=${dateArray[numDates-1]}&limit=200`,
//           headers: {
//             'token': process.env.NCDCNOAATOKEN
//           }
//         };
        
//         function callback1(error, response, body) {
//           if (!error && response.statusCode == 200) {
//             const info = JSON.parse(body);
//             let numObjects = Object.keys(info.results).length;
//             for(var i = 0;i<numObjects;i++)
//             {
//               if(info.results[i].datatype==='TMAX')
//               {
//                 var obj = new Object();
//                 obj.highTemp = info.results[i].value;
//                 obj.highTempDate = df(info.results[i].date, "isoDate");
//                 tempArray.push(obj);
//               }
//             }
            
//             if(tempArray.length>0)
//             {
//               var tempLen = tempArray.length;
//               for(var j = 0;j<tempLen;j++)
//               {
//                 connection.query(`UPDATE weather_data.weather SET actualMax = ${tempArray[j].highTemp} WHERE date = '${tempArray[j].highTempDate}'`,  function (error, results, fields){
//                   console.log("Error in updating weather table: " + error);
//                 });
//               }            
//             }
//         }
//       }

//         request(options1, callback1);      
//    }
//    });
 };
});

bot.login(process.env.TOKEN);