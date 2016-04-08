import Base from './base'
import moment from 'moment'

const Datepicker = (($) => {

  /**
   * ------------------------------------------------------------------------
   * Constants
   * ------------------------------------------------------------------------
   */
  const NAME = 'datepicker'
  const DATA_KEY = `bmd.${NAME}`
  const EVENT_KEY           = `.${DATA_KEY}`
  const DATA_API_KEY        = '.data-api'
  const JQUERY_NAME = `bmd${NAME.charAt(0).toUpperCase() + NAME.slice(1)}`
  const JQUERY_NO_CONFLICT = $.fn[JQUERY_NAME]

  //const Event = {
  //  SHOW           : `show${EVENT_KEY}`,
  //  SHOWN          : `shown${EVENT_KEY}`,
  //  HIDE           : `hide${EVENT_KEY}`,
  //  HIDDEN         : `hidden${EVENT_KEY}`,
  //  CLICK_DATA_API : `click${EVENT_KEY}${DATA_API_KEY}`
  //}

  const Default = {
    lang: 'en',
    //-----------------
    // view types:
    //    days(0) | months(1) | years(2) | decades(3) | centuries(4)
    view: {
      start: 'days', // The view that the datepicker should show when it is opened - string or digit
      min: 'days', // Set a minimum limit for the view mode
      max: 'centuries' // Set a maximum limit for the view mode
    },
    // ----------------
    // multi-dates
    //
    multidate: {
      // Enable multidate picking. Each date in month view acts as a toggle button, keeping track of which dates the user has selected in order. If a number is given, the picker will limit how many dates can be selected to that number, dropping the oldest dates from the list when the number is exceeded. true equates to no limit. The input’s value (if present) is set to a string generated by joining the dates, formatted, with multidate.separator
      enabled: false,
      // The string that will appear between dates when generating the input’s value. When parsing the input’s value for a multidate picker, this will also be used to split the incoming string to separate multiple formatted dates; as such, it is highly recommended that you not use a string that could be a substring of a formatted date (eg, using ‘-‘ to separate dates when your format is ‘yyyy-mm-dd’).
      separator: ','
    },
    week: {
      start: 0 // Day of the week start. 0 (Sunday) to 6 (Saturday)
      // end is calculated based on start
    },
    // format: // pass in a momentjs compatible format, or it will default to L based on locale
    date: {
      //start: default: beginning of time - The earliest date that may be selected; all earlier dates will be disabled.
      //end:  default: end of time - The latest date that may be selected; all later dates will be disabled
      disabled: [] // Single or Array of disabled dates - can be string or moment
      //'default': // default is today - can be a string or a moment
    },
    daysOfWeek: {
      // Values are 0 (Sunday) to 6 (Saturday)
      disabled: [],   // Days of the week that should be disabled. Example: disable weekends: [0,6]
      highlighted: [] // Days of the week that should be highlighted. Example: highlight weekends: [0,6].
    },
    // Popper.js options - see https://popper.js.org/
    popper: {
      // any popper.js options are valid here and will be passed to that component
    }
  }

  /**
   * ------------------------------------------------------------------------
   * Class Definition
   * ------------------------------------------------------------------------
   */
  class Datepicker extends Base {

    constructor($element, ...configs) {
      super($element, Default, ...configs)

      // get our own instance and configure the locale
      this.moment = moment()
      this.moment.locale(this.config.lang)

      this.normalizeConfig()
    }

    dispose(dataKey = DATA_KEY) {
      super.dispose(dataKey)
    }


    // ------------------------------------------------------------------------
    // protected

    // ------------------------------------------------------------------------
    // private
    normalizeConfig() {
      // Normalize views as view-type integers
      this.config.view.start = this.resolveViewType(this.config.view.start);
      this.config.view.min = this.resolveViewType(this.config.view.min);
      this.config.view.max = this.resolveViewType(this.config.view.max);

      // Check that the start view is between min and max
      this.config.view.start = Math.min(this.config.view.start, this.config.view.max);
      this.config.view.start = Math.max(this.config.view.start, this.config.view.min);

      // Multi-dates
      // true, false, or Number > 0
      if (this.config.multidate.enabled !== true) {
        this.config.multidate.enabled = Number(this.config.multidate.enabled) || false;
        if (this.config.multidate.enabled !== false)
          this.config.multidate.enabled = Math.max(0, this.config.multidate.enabled);
      }
      this.config.multidate.separator = String(this.config.multidate.separator);

      // Week
      this.config.week.start %= 7;
      this.config.week.end = (this.config.week.start + 6) % 7;

      // Format - setup the format or default to a momentjs format
      this.config.format = this.config.format || this.moment.localeData().longDateFormat('L');

      // Start/End or Min/max dates
      if (this.config.date.start) {
        // verify/reparse
        this.config.date.start = this.parseDate(this.config.date.start)
      }
      else {
        // default to beginning of time
        this.config.date.start = this.startOfAllTime()
      }

      if (this.config.date.end) {
        // verify/reparse
        this.config.date.end = this.parseDate(this.config.date.end)
      }
      else {
        // default to beginning of time
        this.config.date.end = this.endOfAllTime()
      }

      // Disabled dates
      if (!Array.isArray(this.config.date.disabled)) {
        this.config.date.disabled = [this.config.date.disabled]
      }

      let newDisabled = []
      for (let d of this.config.date.disabled) {
        newDisabled.push(this.parseDate(d))
      }
      this.config.date.disabled = newDisabled

      // Default date - if unspecified, it is now
      this.config.date.default = this.config.date.default || this.moment.clone()
    }

    parseDate(value, format = this.config.format) {
      // @see http://momentjs.com/docs/#/parsing/

      // return any current moment
      if (moment.isMoment(value)) {
        if (!value.isValid()) {
          this.throwError(`Invalid moment: ${value} provided.`)
        }

        return value
      }
      else if (typeof value === "string") {
        // parse with locale and strictness
        let m = moment(value, format, this.config.lang, true)

        if (!m.isValid()) {
          this.throwError(`Invalid moment: ${value} for format: ${format} and locale: ${this.config.lang}`)
        }

        return m
      }
      else {
        this.throwError(`Unknown value type ${typeof value} for value: ${this.dump(value)}`)
      }
    }

    startOfDay(moment = this.moment) {
      return moment.clone().startOf('day')
    }

    startOfAllTime(moment = this.moment) {
      return moment.clone().startOf('year').year(0)
    }

    endOfAllTime(moment = this.moment) {
      return moment.clone().endOf('year').year(2200) // ?? better value to set for this?
    }

    resolveViewType(view) {
      if (typeof view === 'string') {
        let value = null
        switch (view) {
          case 'months':
            value = 1;
            break;
          case 'years':
            value = 2;
            break;
          default:
            value = 0;
            break;
        }
        return value
      }
      else {
        return view
      }
    }

    // ------------------------------------------------------------------------
    // static
    static _jQueryInterface(config) {
      return this.each(function () {
        let $element = $(this)
        let data = $element.data(DATA_KEY)

        if (!data) {
          data = new Datepicker($element, config)
          $element.data(DATA_KEY, data)
        }
      })
    }
  }

  /**
   * ------------------------------------------------------------------------
   * jQuery
   * ------------------------------------------------------------------------
   */
  $.fn[JQUERY_NAME] = Datepicker._jQueryInterface
  $.fn[JQUERY_NAME].Constructor = Datepicker
  $.fn[JQUERY_NAME].noConflict = () => {
    $.fn[JQUERY_NAME] = JQUERY_NO_CONFLICT
    return Datepicker._jQueryInterface
  }

  return Datepicker

})(jQuery)

export default Datepicker
