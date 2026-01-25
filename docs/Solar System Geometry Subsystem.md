Detailed architectural plan for a Solar System Geometry Subsystem tailored for high-fidelity planetary rendering.  
**System Architecture Overview**  
This subsystem acts as the "truth source" for your rendering engine. It decouples astronomical calculations (CPU, double precision) from the rendering pipeline (GPU, single precision). The system proceeds in a hierarchical transformation pipeline: **Time** → **Heliocentric/Geocentric State** → **Topocentric State** → **Visual Artifacts.**  
\--------------------------------------------------------------------------------  
**1\. Temporal Framework (Time Engine)**  
Astronomical algorithms require a continuous, uniform time scale rather than standard civil time.  
• **Julian Date (JD):** You must implement a converter from Gregorian Date (Year, Month, Day, Hour, Minute, Second) to Julian Date. This is a continuous count of days since January 1, 4713 BCE.  
    ◦ **Algorithm:** Handle the calendar shift (if Month≤2, treat as month 13 or 14 of the previous year). Calculate fractional day from hours/minutes/seconds.  
• **Julian Centuries (**T**):** Most orbital elements are expressed as polynomials of T, representing the number of Julian centuries since the standard epoch **J2000.0** (JD 2,451,545.0).  
    ◦ *Formula:* T=36525JD−2451545.0​.  
• **Sidereal Time:** To place the observer on the rotating Earth, calculate **Greenwich Mean Sidereal Time (GMST)**.  
    ◦ *Logic:* GMST links the sun's mean longitude to the Earth's rotation.  
    ◦ *Local Sidereal Time (LST):* LST=GMST+15ObserverLongitude​ (converting degrees to hours).  
\--------------------------------------------------------------------------------  
**2\. Solar Ephemeris Module**  
This module calculates the Sun's position. While the Earth orbits the Sun, geocentric rendering calculates the Sun's "apparent" orbit around Earth using the **Ecliptic Coordinate System**.  
• **Mean Elements:** Calculate the Sun's **Mean Longitude (**L0​**)** and **Mean Anomaly (**M**)** using linear polynomials of T.  
• **Equation of Center (**C**):** Correct the uniform motion for the eccentricity of Earth's orbit.  
    ◦ *Detail:* Use the first few terms of the sine series: C≈1.9146sin(M)+0.0199sin(2M). Add this to L0​ to get **True Longitude**.  
• **Coordinate Conversion:**  
    1\. **Obliquity of the Ecliptic (**ϵ**):** Calculate the tilt of Earth's axis (≈23.44∘) as a function of T.  
    2\. **Ecliptic to Equatorial:** Convert Ecliptic Longitude (λ) to **Right Ascension (**α**)** and **Declination (**δ**)** using spherical trigonometry:  
        ▪ tanα=cosλcosϵsinλ​  
        ▪ sinδ=sinϵsinλ.  
\--------------------------------------------------------------------------------  
**3\. Lunar Ephemeris Module**  
The Moon requires a significantly more complex model due to perturbations from the Sun. A simple elliptical orbit will result in errors visible to the naked eye (up to several degrees).  
• **Fundamental Arguments:** Calculate four key angles changing linearly with time (T):  
    ◦ L′: Moon's mean longitude.  
    ◦ D: Mean elongation (angle between Sun and Moon).  
    ◦ M′: Moon's mean anomaly.  
    ◦ F: Moon's argument of latitude (distance from the ascending node).  
• **Perturbations (The "Meeus" Truncation):** Apply the major periodic corrections to the Moon's longitude (Σl) and latitude (Σb). For 1-2 arcminute accuracy (sufficient for rendering), include the following named terms:  
    ◦ **Evection:** 1.274sin(2D−M′)  
    ◦ **Variation:** 0.658sin(2D)  
    ◦ **Annual Equation:** −0.186sin(M)  
• **Geocentric Coordinates:** Sum the mean elements and perturbations to get Geocentric Longitude (λg​) and Latitude (βg​). Convert these to Geocentric Equatorial coordinates (αg​,δg​) using the Obliquity (ϵ).  
\--------------------------------------------------------------------------------  
**4\. Observer Bridge (Topocentric Correction)**  
This step is critical for the Moon. Because the Moon is close (≈384,000 km), its position shifts by up to 1∘ depending on where the observer stands on Earth (parallax). You must convert **Geocentric** coordinates to **Topocentric** coordinates.  
• **Horizontal Coordinates:** Convert Equatorial (α,δ) to **Altitude (**h**)** and **Azimuth (**A**)**.  
    ◦ *Local Hour Angle (*H*):* H=LST−α.  
    ◦ *Transformation:* Use standard spherical trig to find unrefracted Altitude and Azimuth.  
• **Parallax Correction (Moon Only):**  
    ◦ Calculate **Horizontal Parallax (**HP**)**: The angle subtended by Earth's radius at the Moon distance.  
    ◦ *Topocentric Altitude:* h′=h−HPcos(h). This lowers the Moon's altitude relative to the geocentric view, correcting rise/set times.  
• **Atmospheric Refraction:**  
    ◦ For both Sun and Moon, apparent altitude increases near the horizon.  
    ◦ *Algorithm:* Apply Bennett's or Sæmundsson's formula to the altitude. At the horizon, add ≈34 arcminutes (0.57∘). This makes the sun/moon visible before they geometrically rise.  
\--------------------------------------------------------------------------------  
**5\. Visual Phenomena Subsystem**  
Calculates the specific rendering parameters for your shaders.  
• **Lunar Phase (**k**):**  
    ◦ Calculate the **Phase Angle (**i**)** (angle Earth-Moon-Sun).  
    ◦ *Illuminated Fraction:* k=(1+cosi)/2.  
• **Orientation (The "Tilt"):**  
    ◦ The Moon's lit side must point to the Sun. This orientation changes as the Moon crosses the sky (field rotation).  
    ◦ **Position Angle of the Bright Limb (**χ**):** Calculate the angle of the sun vector relative to celestial North using the Equatorial coordinates of Sun and Moon.  
    ◦ **Parallactic Angle (**q**):** Calculate the angle between "Zenith Up" and "Celestial North" based on Hour Angle and Latitude.  
    ◦ *Render Rotation:* The final rotation for your moon texture is χ−q.  
• **Angular Diameter:**  
    ◦ Varies with distance (r).  
    ◦ Sun ≈0.533∘, Moon ≈0.518∘ (varies noticeably between apogee/perigee).  
\--------------------------------------------------------------------------------  
**Minimal Code Plan (C\# Style)**  
// 1\. Time  
double jd \= CalculateJulianDate(year, month, day, hour, minute, second);  
double T \= (jd \- 2451545.0) / 36525.0; // Julian Centuries

// 2\. Solar Coordinates (Geocentric)  
double L0 \= 280.46646 \+ 36000.76983 \* T; // Mean Longitude  
double M \= 357.52911 \+ 35999.05029 \* T;  // Mean Anomaly  
double C \= 1.9146 \* Sin(M) \+ 0.0199 \* Sin(2 \* M); // Equation of Center  
double lambda\_sun \= L0 \+ C; // True Longitude  
double epsilon \= 23.439 \- 0.013 \* T; // Obliquity  
// Convert to Equatorial (Right Ascension/Declination)  
Vector2 sunEq \= EclipticToEquatorial(lambda\_sun, 0, epsilon);

// 3\. Lunar Coordinates (Geocentric with Perturbations)  
double L\_moon \= 218.316 \+ 481267.881 \* T;  
double D \= 297.85 \+ 445267.111 \* T; // Mean Elongation  
// ... (Calculate M\_moon, F)  
// Apply Perturbations (Evection, Variation, etc.)  
double lon\_moon \= L\_moon \+ 6.289 \* Sin(M\_moon) \- 1.274 \* Sin(M\_moon \- 2\*D) \+ ...;  
Vector2 moonEq \= EclipticToEquatorial(lon\_moon, lat\_moon, epsilon);

// 4\. Observer Frame (Topocentric)  
double GMST \= CalculateGMST(jd);  
double LST \= GMST \+ observerLongitude / 15.0;  
double HourAngle\_Sun \= (LST \* 15.0) \- sunEq.RA;  
double HourAngle\_Moon \= (LST \* 15.0) \- moonEq.RA;

// Convert to Horizon Coordinates (Alt/Az)  
Vector2 sunHoriz \= EquatorialToHorizontal(sunEq, HourAngle\_Sun, observerLat);  
Vector2 moonHoriz \= EquatorialToHorizontal(moonEq, HourAngle\_Moon, observerLat);

// Apply Parallax (Moon only)  
moonHoriz.Alt \-= horizontalParallax \* Cos(moonHoriz.Alt);

// Apply Refraction (Both)  
sunHoriz.Alt \+= Refraction(sunHoriz.Alt);  
moonHoriz.Alt \+= Refraction(moonHoriz.Alt);

// 5\. Visuals  
double brightLimbAngle \= CalculatePositionAngle(sunEq, moonEq);  
double parallacticAngle \= CalculateParallacticAngle(HourAngle\_Moon, observerLat, moonEq.Dec);  
double textureRotation \= brightLimbAngle \- parallacticAngle;

