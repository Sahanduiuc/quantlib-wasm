var QuantLibModule = require(".");

var QuantLib = null;
const bytesDiff = (m0, m1) => m1.uordblks - m0.uordblks + (m1.hblkhd - m0.hblkhd);
const toWasmVector = (arr, type) => {
    let res = new type(arr.length);
    for (let j = 0; j < arr.length; j++) {
        res.set(j, arr[j]);
    }
    return res;
};

describe("captor/quantlib", () => {
    beforeAll(async () => {
        var loader = QuantLibModule();
        loader.ready = () =>
            // https://github.com/emscripten-core/emscripten/issues/5820
            new Promise((resolve, reject) => {
                delete loader.then;
                loader.onAbort = reject;
                loader.addOnPostRun(() => {
                    resolve(loader);
                });
            });
        QuantLib = await loader.ready();
    });

    test("Sweden Calendar", async () => {
        var calendar = new QuantLib.Sweden();
        expect(calendar.name()).toBe("Sweden");
        calendar.delete();
    });

    test("Calendar weekday", async () => {
        const { Date, Weekday } = QuantLib;
        var settlementDate = Date.fromISOString("2008-09-18");
        expect(settlementDate.weekday().value).toBe(Weekday.Thursday.value);
        settlementDate.delete();
    });

    test("UK Calendar", async () => {
        // Market Holidays
        // Holiday	Markets Closed
        // 05/27/2019	Monday	London Stock ExchangeUnited Kingdom
        // 08/26/2019	Monday	London Stock ExchangeUnited Kingdom
        // 12/25/2019	Wednesday	London Stock ExchangeUnited Kingdom
        // 12/26/2019	Thursday	London Stock ExchangeUnited Kingdom
        const { Date, Weekday, UnitedKingdom, Month, UnitedKingdomMarket } = QuantLib;
        const { May, August, December } = Month;
        var dates = [new Date(27, May, 2019), new Date(26, August, 2019), new Date(25, December, 2019), new Date(26, December, 2019)];
        var cal = new UnitedKingdom(UnitedKingdomMarket.Exchange);
        dates.forEach((d) => {
            expect(cal.isBusinessDay(d)).toBe(false);
        });
        [cal, ...dates].forEach((d) => d.delete());
    });

    test("Calendar adjust and advance", async () => {
        const { Date, BusinessDayConvention, TimeUnit, TARGET } = QuantLib;
        var settlementDate = Date.fromISOString("2008-09-18");
        var calendar = new TARGET();
        var settlementDateAdj = calendar.adjust(settlementDate, BusinessDayConvention.Following);
        var fixingDays = 3;
        var todaysDate = calendar.advance(settlementDateAdj, -fixingDays, TimeUnit.Days, BusinessDayConvention.Following, true);
        expect(todaysDate.toISOString()).toBe("2008-09-15");
        [settlementDate, settlementDateAdj, todaysDate, calendar].forEach((d) => d.delete());
    });

    test("Date", async () => {
        const { Date, Month } = QuantLib;
        var myDate = new Date(12, Month.Aug, 2009);
        expect(myDate.toISOString()).toBe("2009-08-12");
        expect(myDate.weekday().value).toBe(4);
        expect(myDate.dayOfMonth()).toBe(12);
        expect(myDate.dayOfYear()).toBe(224);
        expect(myDate.month().value).toBe(8);
        expect(myDate.year()).toBe(2009);
        expect(myDate.serialNumber()).toBe(40037);
    });

    test("DayCounters", async () => {
        const { Date, Month, Thirty360, Actual360, Actual365Fixed, ActualActual, Business252 } = QuantLib;
        var start = new Date(22, Month.January, 2017);
        var end = new Date(22, Month.August, 2019);

        var expects = [930, 942, 942, 942, 645];
        [Thirty360, Actual360, Actual365Fixed, ActualActual, Business252].forEach((type, i) => {
            var dc = new type();
            var d = dc.dayCount(start, end);
            expect(d).toBe(expects[i]);
            dc.delete();
        });
        [start, end].forEach((d) => d.delete());
    });

    test("Vector", async () => {
        const { Vector$double$ } = QuantLib;
        var m0 = QuantLib.mallinfo();
        for (let i = 0; i < 5; i++) {
            let n = 100000;
            let arr = new Vector$double$(n);
            for (let j = 0; j < n; j++) {
                arr.set(j, j + 1);
            }
            arr.delete();
        }
        var m1 = QuantLib.mallinfo();
        expect(bytesDiff(m0, m1)).toBe(0);
    });

    test("Bootstrapping", async () => {
        const { Date, UnitedKingdom, UnitedStates, JointCalendar, UnitedKingdomMarket, UnitedStatesMarket, JointCalendarRule } = QuantLib;
        const { TimeUnit, BusinessDayConvention, Month, setValuationDate, Actual360, QuoteHandle, Period, DepositRateHelper } = QuantLib;
        const { IMM, FuturesRateHelper, SwapRateHelper, Frequency, USDLibor, Compounding } = QuantLib;
        const { January, February, March, April, May, June, July, August, September, October, November, December } = Month;
        const { Days, Weeks, Months, Years } = TimeUnit;
        const { Simple, Compounded } = Compounding;

        var cal1 = new UnitedKingdom(UnitedKingdomMarket.Exchange);
        var cal2 = new UnitedStates(UnitedStatesMarket.Settlement);
        var calendar = new JointCalendar(cal1, cal2, JointCalendarRule.JoinHolidays);

        var d0 = new Date(18, February, 2015);
        var settlementDate = calendar.adjust(d0, BusinessDayConvention.Following);
        var fixingDays = 2;
        var todaysDate = calendar.advance(settlementDate, -fixingDays, TimeUnit.Days, BusinessDayConvention.Following, false);
        setValuationDate(todaysDate);

        var depositDayCounter = new Actual360();
        var depositsBusinessDayConvention = BusinessDayConvention.ModifiedFollowing;

        var trashcan = [cal1, cal2, calendar, d0, settlementDate, todaysDate, depositDayCounter];

        var depoFutSwapInstruments = [];

        var deposits = [
            { rate: 0.001375, periods: 7, unit: Days },
            { rate: 0.001717, periods: 4, unit: Weeks },
            { rate: 0.002112, periods: 2, unit: Months },
            { rate: 0.002581, periods: 3, unit: Months }
        ];
        deposits.forEach((d) => {
            var quote = new QuoteHandle(d.rate);
            var period = new Period(d.periods, d.unit);
            depoFutSwapInstruments.push(
                new DepositRateHelper(quote, period, fixingDays, calendar, depositsBusinessDayConvention, true, depositDayCounter)
            );
            trashcan.push(quote);
            trashcan.push(period);
        });

        var futDayCounter = new Actual360();
        var futMonths = 3;
        var futures = [{ rate: 99.725 }, { rate: 99.585 }, { rate: 99.385 }, { rate: 99.16 }, { rate: 98.93 }, { rate: 98.715 }];
        var imm = IMM.nextDate(settlementDate, true);
        trashcan.push(futDayCounter);
        futures.forEach((d) => {
            var quote = new QuoteHandle(d.rate);
            depoFutSwapInstruments.push(
                new FuturesRateHelper(quote, imm, futMonths, calendar, BusinessDayConvention.ModifiedFollowing, true, depositDayCounter)
            );
            trashcan.push(imm);
            imm = IMM.nextDate(imm, true);
            trashcan.push(quote);
        });
        trashcan.push(imm);

        var swFixedLegFrequency = Frequency.Annual;
        var swFixedLegConvention = BusinessDayConvention.Unadjusted;
        var swFixedLegDayCounter = new Actual360();
        var swFloatingLegIndexPeriod = new Period(3, Months);
        var swFloatingLegIndex = new USDLibor(swFloatingLegIndexPeriod);
        trashcan.push(swFixedLegDayCounter);
        trashcan.push(swFloatingLegIndexPeriod);
        trashcan.push(swFloatingLegIndex);

        var swaps = [
            { rate: 0.0089268, periods: 2, unit: Years },
            { rate: 0.0123343, periods: 3, unit: Years },
            { rate: 0.0147985, periods: 4, unit: Years },
            { rate: 0.0165843, periods: 5, unit: Years },
            { rate: 0.0179191, periods: 6, unit: Years }
        ];
        swaps.forEach((d) => {
            var quote = new QuoteHandle(d.rate);
            var period = new Period(d.periods, d.unit);
            depoFutSwapInstruments.push(
                new SwapRateHelper(
                    quote,
                    period,
                    calendar,
                    swFixedLegFrequency,
                    swFixedLegConvention,
                    swFixedLegDayCounter,
                    swFloatingLegIndex
                )
            );
            trashcan.push(quote);
            trashcan.push(period);
        });

        var termStructureDayCounter = new Actual360();
        trashcan.push(termStructureDayCounter);
        var instrs = toWasmVector(depoFutSwapInstruments, QuantLib.Vector$RateHelper$);
        var depoFutSwapTermStructure = new QuantLib.PiecewiseYieldCurve$Discount$Linear$(
            settlementDate,
            instrs,
            termStructureDayCounter,
            1.0e-15
        );

        var maturities = [
            [0.1375, new Date(25, February, 2015), Simple],
            [0.1717, new Date(18, March, 2015), Simple],
            [0.2112, new Date(20, April, 2015), Simple],
            [0.2581, new Date(18, May, 2015), Simple],
            [0.25093, new Date(17, June, 2015), Simple],
            [0.32228, new Date(16, September, 2015), Simple],
            [0.41111, new Date(16, December, 2015), Simple],
            [0.51112, new Date(16, March, 2016), Simple],
            [0.61698, new Date(15, June, 2016), Simple],
            [0.73036, new Date(21, September, 2016), Compounded],
            [0.89446, new Date(21, February, 2017), Compounded],
            [1.23937, new Date(20, February, 2018), Compounded],
            [1.49085, new Date(19, February, 2019), Compounded],
            [1.6745, new Date(18, February, 2020), Compounded]
        ];
        var log = [];
        maturities.forEach((d, i) => {
            var interestRate = depoFutSwapTermStructure.zeroRate(d[1], depositDayCounter, d[2], Frequency.Annual, false);
            log.push(`${d[0]}: ${interestRate.toString()}`);
            interestRate.delete();
        });
        log.push(`Discount Rate : ${depoFutSwapTermStructure.discount(maturities[13][1], false).toFixed(6)}`);
        var forwardRate = depoFutSwapTermStructure.forwardRate(
            maturities[12][1],
            maturities[13][1],
            futDayCounter,
            Simple,
            Frequency.Annual,
            false
        );
        log.push(`Forward Rate : ${forwardRate}`);
        trashcan.push(forwardRate);
        maturities.forEach((d) => trashcan.push(d[1]));

        trashcan.push(depoFutSwapTermStructure);
        trashcan.push(instrs);

        trashcan.forEach((d) => d.delete());
        var result = [
            "0.1375: 0.137499 % Actual/360 simple compounding",
            "0.1717: 0.171700 % Actual/360 simple compounding",
            "0.2112: 0.211200 % Actual/360 simple compounding",
            "0.2581: 0.258100 % Actual/360 simple compounding",
            "0.25093: 0.251098 % Actual/360 simple compounding",
            "0.32228: 0.322259 % Actual/360 simple compounding",
            "0.41111: 0.411112 % Actual/360 simple compounding",
            "0.51112: 0.511346 % Actual/360 simple compounding",
            "0.61698: 0.617716 % Actual/360 simple compounding",
            "0.73036: 0.732486 % Actual/360 Annual compounding",
            "0.89446: 0.890789 % Actual/360 Annual compounding",
            "1.23937: 1.237068 % Actual/360 Annual compounding",
            "1.49085: 1.489769 % Actual/360 Annual compounding",
            "1.6745: 1.674417 % Actual/360 Annual compounding",
            "Discount Rate : 0.919223",
            "Forward Rate : 2.419765 % Actual/360 simple compounding"
        ].join("\r\n");
        expect(log.join("\r\n")).toBe(result);
    });
});
