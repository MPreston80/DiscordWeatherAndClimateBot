DROP PROCEDURE IF EXISTS loopdemo;
DELIMITER $$
CREATE PROCEDURE loopdemo()
BEGIN
DECLARE j INT;
SET j = 1;
mylittleloop: LOOP
IF (SELECT actualMax FROM weather_data.weather WHERE recordID = j) IS NOT NULL THEN
UPDATE weather_data.weather SET deviationfromAverage = (actualMax - historicalAverage) where recordID = j;
UPDATE weather_data.weather SET forecastAccuracy = ABS(actualMax - forecastMax) where recordID = j;
END IF;
IF (SELECT actualMax FROM weather_data.weather WHERE recordID = j) IS NULL THEN
LEAVE mylittleloop;
END IF;
SET j = j + 1;
ITERATE mylittleloop;
END LOOP mylittleloop;
END$$
DELIMITER ;

