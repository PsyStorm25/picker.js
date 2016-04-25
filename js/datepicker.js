import Base from './base'
import Renderer from './renderer'
import EventManager from './eventManager'
import DateArray from './util/dateArray'
import DateRangePicker from './dateRangePicker'
import {JQUERY_NAME, Data, Event, Selector, ClassName, Unit, View} from './constants'
import Popper from 'popper.js'
import moment from 'moment'
import {main} from './templates'

/**
 * Datepicker for fields using momentjs for all date-based functionality.
 *
 * Internal dates are stored as UTC moments.  To use them in local time, execute moment.local() prior to formatting.
 */
const Datepicker = (($) => {

  const JQUERY_NO_CONFLICT = $.fn[JQUERY_NAME]
  const Default = {
    // lang defaults to en, most i18n comes from moment's locales.
    lang: 'en',
    // i18n - for the very few strings we use.
    i18n: {
      en: {
        today: 'Today',
        clear: 'Clear'
      }
    },

    autoclose: false, // Whether or not to close the datepicker immediately when a date is selected
    keyboard: {
      navigation: true, // allow date navigation by arrow keys
      touch: true // false will disable keyboard on mobile devices
    },
    rtl: false,
    enableOnReadonly: true, // If false the datepicker will not show on a readonly datepicker field
    showOnFocus: true, // If false, the datepicker will be prevented from showing when the input field associated with it receives focus
    zIndexOffset: 10, // z-index of the open datepicker is the maximum z-index of the input and all of its DOM ancestors plus the zIndexOffset.
    immediateUpdates: false, // if true, selecting a year or month in the datepicker will update the input value immediately. Otherwise, only selecting a day of the month will update the input value immediately.
    title: '', // string that will appear on top of the datepicker. If empty the title will be hidden.
    today: {
      button: false // If true, displays a “Today” button at the bottom of the datepicker to select the current date
    },
    clear: {
      button: false
    },

    //-----------------
    // view types:
    //    days | months | years | decades | centuries
    view: {
      start: 'days', // The view that the datepicker should show when it is opened
      min: 'days', // Set a minimum limit for the view mode
      max: 'centuries', // Set a maximum limit for the view mode
      modes: [
        {
          cssClass: ClassName.DAYS,
          navStep: 1
        },
        {
          cssClass: ClassName.MONTHS,
          navStep: 1
        },
        {
          cssClass: ClassName.YEARS,
          navStep: 10
        },
        {
          cssClass: ClassName.DECADES,
          navStep: 100
        },
        {
          cssClass: ClassName.CENTURIES,
          navStep: 1000
        }]
    },

    week: {
      start: 0 // Day of the week start. 0 (Sunday) to 6 (Saturday)
      // end is calculated based on start
    },
    // format: // pass in a momentjs compatible format, or it will default to L based on locale
    date: {
      //start: default: beginning of time - The earliest date that may be selected all earlier dates will be disabled.
      //end:  default: end of time - The latest date that may be selected all later dates will be disabled
      disabled: [], // Single or Array of disabled dates - can be string or moment
      //'default': // default is today - can be a string or a moment

      toggle: false, // If true, selecting the currently active date will unset the respective date (same as multi-date behavior)

      // -----------
      // multi-dates
      count: 1, // // 2 or more will enable multidate picking. Each date in month view acts as a toggle button, keeping track of which dates the user has selected in order. If a number is given, the picker will limit how many dates can be selected to that number, dropping the oldest dates from the list when the number is exceeded. true equates to no limit. The input’s value (if present) is set to a string generated by joining the dates, formatted, with multidate.separator
      separator: ',', // Separator for multiple dates when generating the input value
    },
    daysOfWeek: {
      // Values are 0 (Sunday) to 6 (Saturday)
      disabled: [],   // Days of the week that should be disabled. Example: disable weekends: [0,6]
      highlighted: [] // Days of the week that should be highlighted. Example: highlight weekends: [0,6].
    },

    // Popper.js options - see https://popper.js.org/
    popper: {
      // any popper.js options are valid here and will be passed to that component
      placement: 'right',
      removeOnDestroy: true
    },

    template: main,

    // -------------------
    // callbacks  FIXME: better way to do this?

    /*
     A function that takes a date as a parameter and returns one of the following values:

     - undefined to have no effect
     - An object with the following properties:
     disabled: A Boolean, indicating whether or not this date is disabled
     classes: A String representing additional CSS classes to apply to the date’s cell
     tooltip: A tooltip to apply to this date, via the title HTML attribute
     */
    beforeShowDay: undefined,
    beforeShowMonth: undefined,
    beforeShowYear: undefined,
    beforeShowDecade: undefined,
    beforeShowCentury: undefined
  }

  /**
   * ------------------------------------------------------------------------
   * Class Definition
   * ------------------------------------------------------------------------
   * TODO: break this into components - ConfigurationManager(? not sure on this one), DateManager, EventManager, Renderer?
   */
  class Datepicker extends Base {

    constructor($element, ...configs) {
      super(Default, ...configs)

      this.$element = $element
      this.shown = false
      this.dates = null //new DateArray() no need to init, #update will init initial round

      // get our own utc instance and configure the locale
      this.moment = this.newMoment()

      // disallow updates during setup, call after
      this.allowUpdate = false

      // normalize options that are flexible
      this.normalizeConfig()

      //
      this.view = this.config.view.start

      // inline datepicker if target is a div
      if (this.$element.is('div')) {
        this.isInline = true
      }
      // find the $input right now
      else if (this.$element.is('input')) {
        this.$input = this.$element
      }
      else {
        throw new Error(`Target element[${this.$element[0].localName}] is neither a div(inline) nor an input.`)
      }

      // FIXME: data-datepicker-toggle='#input-id' or whatever pattern bootstrap uses for toggle - `click: () => this.show()` instead of old `component` or add-on

      // initialize the renderer and create the $picker element
      this.renderer = new Renderer(this)

      // initialize the EventManager
      this.eventManager = new EventManager(this)

      // turn back on updates
      this.allowUpdate = true
      this.update()
      this.showView()

      if (this.isInline) {
        this.show()
      }
    }

    dispose(dataKey = Data.KEY) {
      this.hide()
      this.eventManager.dispose()
      this.renderer.dispose()
      this.eventManager = undefined
      this.renderer = undefined
      this.popper = undefined
      super.dispose(dataKey)
    }

    /**
     * @returns a new UTC moment configured with the locale
     */
    newMoment(...args) {
      let m = null

      if (args.length < 1) {
        // if no args, use the current date/time (cannot pass in null otherwise time is zeroed)
        m = moment()
      }
      else {
        m = moment(...args)
      }

      m.utc()
      m.locale(this.config.lang)
      return m
    }

    /**
     * @returns - array of UTC moments selected
     */
    getDates(){

      // Depending on the show/hide state when called, this.dates may or may not be populated.
      //  Use it if populated (i.e. initial #update before show), not based on #isShowing
      return (this.dates ? this.dates.array : undefined) || this.parseDateArrayFromInput()
    }

    /**
     * Determine the viewDate and constrain by the configuration - no side effects
     *
     * NOTE: this.viewDate is null after hidden, and this methoud is used by #update to redetermine a new value.
     *        The result of this method is explicitly not cached, if you want the cached value during a normal
     *        internal operation, you should be using the `this.viewDate` set by #update
     * @param fallbackToDefaults - resolve the date first, if not found, fallback to the default config.date.start
     * @returns - the latest UTC moment selected
     */
    getDate(fallbackToDefaults = false){
      // Depending on the show/hide state when called, this.dates may or may not be populated.
      //  Use it if populated (i.e. initial #update before show), not based on #isShowing
      let dateArray = this.getDates()
      if (dateArray.length) {
        // return the last date in the array (go backwards 1 index)
        return dateArray.slice(-1)[0].clone()
      }

      // if not found above and not to be resolved by defaults, null
      if(!fallbackToDefaults){
        return null
      }

      // resolve based on the defaults
      if (this.viewDate < this.config.date.start) {
        return this.config.date.start.clone()
      }
      else if (this.viewDate > this.config.date.end) {
        return this.config.date.end.clone()
      }
      else {
        return this.config.date.default.clone()
      }
    }

    updateMultidateOrToggle(viewDate) {

      // if multidate is not enabled && and toggle is not true, just update and get out.
      if (this.config.date.count < 2 && this.config.date.toggle !== true) {
        this.update(viewDate)
        return
      }

      // If nothing passed in, we are clearing all dates
      if (!viewDate) {
        this.update(null)
        return
      }

      //------------
      // Multidate enabled
      //------------

      // We need to operate on a temporary date array, passed to update
      let newDates = this.dates.copy()

      let index = newDates.contains(viewDate)

      // first check toggle off on a date
      if (index !== -1) {
        newDates.remove(index)
      }
      // if not a toggle, it's a new date
      else {
        newDates.push(viewDate)
      }

      // constrain the date count by the limit, removing the first
      while (newDates.length() > this.config.date.count) {
        newDates.remove(0)
      }

      // finally call update with the new dates
      if(newDates.length() === 0){
        // if length is 0, pass null to reset the internal dates, otherwise it will look at/parse input
        this.update(null)
      }
      else {
        this.update(...newDates.array)
      }
    }

    /**
     * Any call stack resulting here means that we are selecting a new date (or dates) and re-rendering.
     *
     *
     * @param momentsOrStrings - one or more - String|moment - optional.  null will clear dates, nothing or empty will resolve dates.
     * @returns {Datepicker}
     */
    update(...momentsOrStrings) {
      if (!this.allowUpdate) {
        return this
      }

      // parse dates and get out if there is no diff
      let newDates = this.configureNewDateArray(...momentsOrStrings)
      if (newDates.isSame(this.dates)) {
        this.debug('no update needed, dates are the same')
        return
      }

      // there is a change
      this.dates = newDates

      // resolve the new viewDate constrained by the configuration
      this.viewDate = this.getDate(true)

      // set the input value
      this.$input.val(this.getDateFormatted())

      // re-render the element
      this.renderer.fill()

      // fire the date change
      this.eventManager.trigger(Event.DATE_CHANGE)

      // fire change on the input to be sure other plugins see it (i.e. validation)
      this.$input.change()

      // If on the day view && autoclose is enabled - hide
      if (this.view === View.DAYS && this.config.autoclose) {
        this.hide()
      }

      return this
    }

    /**
     * Sets a new lower date limit on the datepicker.
     * Omit (or provide an otherwise falsey value) to unset the limit.
     * @param dateStart
     * @returns {Datepicker}
     */
    setDateStart(dateStart) {
      if (dateStart) {
        // verify/reparse
        this.config.date.start = this.parseDate(dateStart)
      }
      else {
        // default to beginning of time
        this.config.date.start = this.startOfAllTime()
      }
      // called from #normalizeConfig
      this.update()
      return this
    }

    /**
     * Sets a new upper date limit on the datepicker.
     * Omit (or provide an otherwise falsey value) to unset the limit.
     * @param dateEnd
     * @returns {Datepicker}
     */
    setDateEnd(dateEnd) {

      if (dateEnd) {
        // verify/reparse
        this.config.date.end = this.parseDate(dateEnd)
      }
      else {
        // default to beginning of time
        this.config.date.end = this.endOfAllTime()
      }
      // called from #normalizeConfig
      this.update()
      return this
    }

    /**
     * Sets the days that should be disabled
     * Omit (or provide an otherwise falsey value) to unset.
     * @param dates - String|Moment|Array of String|Moment
     * @returns {Datepicker}
     */
    setDatesDisabled(dates) {
      let dateArray = dates
      // Disabled dates
      if (!Array.isArray(dateArray)) {
        dateArray = [dateArray]
      }

      let newDisabled = []
      for (let d of dateArray) {
        newDisabled.push(this.parseDate(d))
      }
      this.config.date.disabled = newDisabled
      // called from #normalizeConfig
      this.update()
      return this
    }

    /**
     * Sets the days of week that should be disabled.  See config.daysOfWeek.disabled
     * Omit (or provide an otherwise falsey value) to unset.
     * @param days
     * @returns {Datepicker}
     */
    setDaysOfWeekDisabled(days) {
      this.config.daysOfWeek.disabled = days
      this.normalizeConfig()
      this.update()
      return this
    }

    /**
     * Sets the days of week that should be highlighted. See config.daysOfWeek.highlighted
     * Omit (or provide an otherwise falsey value) to unset.
     * @param days
     * @returns {Datepicker}
     */
    setDaysOfWeekHighlighted(days) {
      this.config.daysOfWeek.highlighted = days
      this.normalizeConfig()
      this.update()
      return this
    }

    // ------------------------------------------------------------------------
    // protected

    /**
     *
     * @param range - a {DateRange} from moment-range - provide a falsey value to unset
     */
    setRange(range) {
      this.range = range
      this.renderer.fill();
    }

    // ------------------------------------------------------------------------
    // private

    /**
     * Change view given the direction
     * @param direction
     */
    changeView(direction) {
      this.showView(Math.max(this.config.view.min, Math.min(this.config.view.max, this.view + direction)))
    }

    /**
     * Show a specific view by id.
     * @param viewId
     */
    showView(viewId = this.view) {
      this.view = viewId
      this.renderer.$picker
        .children('div')
        .hide()
        .filter(`.${this.config.view.modes[this.view].cssClass}`) // days|months|years|decades|centuries
        .show()
      this.renderer.updateNavArrows()  // FIXME: redundant?
    }

    /**
     *
     * @param date - start date
     * @param dir - direction/number of units
     * @param unit - day|month|year etc to use with moment#add
     * @returns {*}
     */
    moveAvailableDate(date, dir, unit) {
      let m = date.clone()
      do {
        m = m.add(dir, unit)

        if (!this.dateWithinRange(m))
          return false

        unit = Unit.DAY
      }
      while (this.dateIsDisabled(m))

      return m
    }

    isShowing() {
      return this.shown
    }

    //
    show() {
      if (this.isInline || this.isShowing()) {
        return
      }

      if (this.$input.attr('readonly') && this.config.enableOnReadonly === false) {
        return
      }

      // re-read the dates to populate internal state
      this.update()

      // popper
      this.popper = new Popper(this.$element, {contentType: 'node', content: this.renderer.$picker}, this.config.popper)
      this.shown = true

      this.eventManager.onShown()
      return this
    }

    hide() {
      if (this.isInline || !this.isShowing()) {
        return this
      }

      // on hide, always do the same resets
      this.viewDate = this.dates = null

      // popper
      this.popper.destroy()
      this.popper = undefined
      this.shown = false

      this.eventManager.onHidden()

      // reset the view
      this.showView(this.config.view.start)

      return this
    }

    normalizeConfig() {
      // disallow updates - must call #update after
      let originalAllowUpdate = this.allowUpdate
      this.allowUpdate = false

      // Normalize views as view-type integers
      this.config.view.start = this.resolveViewType(this.config.view.start)
      this.config.view.min = this.resolveViewType(this.config.view.min)
      this.config.view.max = this.resolveViewType(this.config.view.max) // default to years (slightly different than other view resolution)

      // Check that the start view is between min and max
      this.config.view.start = Math.min(this.config.view.start, this.config.view.max)
      this.config.view.start = Math.max(this.config.view.start, this.config.view.min)

      // Week
      this.config.week.start %= 7
      this.config.week.end = (this.config.week.start + 6) % 7

      // Format - setup the format or default to a momentjs format
      this.config.format = this.config.format || this.moment.localeData().longDateFormat('L')

      // Start/End or Min/max dates
      this.setDateStart(this.config.date.start)
      this.setDateEnd(this.config.date.end)
      this.setDatesDisabled(this.config.date.disabled)

      // Default date - if unspecified, it is now
      this.config.date.default = this.parseDate(this.config.date.default || this.moment.clone())

      // restore allowUpdate
      this.allowUpdate = originalAllowUpdate
    }

    formatDate(mom, format = this.config.format) {
      return mom.format(format)
    }

    parseDates(...dates) {
      //if(!dates || dates.length < 1){
      //  return []
      //}

      let results = []
      for (let date of dates) {
        if (date) {
          results.push(this.parseDate(date))
        }
      }
      return results
    }

    parseDate(value, format = this.config.format) {
      // @see http://momentjs.com/docs/#/parsing/

      // return any current moment
      if (moment.isMoment(value)) {
        if (!value.isValid()) {
          this.throwError(`Invalid moment: ${value} provided.`)
        }

        return this.newMoment(value)
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

    shouldBeHighlighted(date) {
      return $.inArray(date.day(), this.config.daysOfWeek.highlighted) !== -1
    }

    weekOfDateIsDisabled(date) {
      return $.inArray(date.day(), this.config.daysOfWeek.disabled) !== -1
    }

    dateIsDisabled(date) {
      return (
        this.weekOfDateIsDisabled(date) ||
        $.grep(this.config.date.disabled,
          (d) => {
            return date.isSame(d, Unit.DAY)
          }
        ).length > 0
      )
    }

    dateWithinRange(date) {
      return date.isSameOrAfter(this.config.date.start) && date.isSameOrBefore(this.config.date.end)
    }

    datesWithinRange(...dates) {
      return $.grep(dates, (date) => {
        return (!this.dateWithinRange(date) || !date)
      }, true)
    }

    startOfDay(moment = this.moment) {
      return moment.clone().startOf(Unit.DAY)
    }

    startOfAllTime(moment = this.moment) {
      return moment.clone().startOf(Unit.YEAR).year(0)
    }

    endOfAllTime(moment = this.moment) {
      return moment.clone().endOf(Unit.YEAR).year(9999) // ?? better value to set for this?
    }

    resolveViewType(view) {
      if (typeof view === 'string') {
        let value = null
        switch (view) {
          case 'days':
            value = View.DAYS
            break
          case 'months':
            value = View.MONTHS
            break
          case 'years':
            value = View.YEARS
            break
          case 'decades':
            value = View.DECADES
            break
          case 'centuries':
            value = View.CENTURIES
            break
          default:
            throw new Error(`Unknown view type '${view}'. Try one of: days | months | years | decades | centuries`)
            break
        }
        return value
      }
      else {
        return view
      }
    }

    clearDates() {
      this.update(null)
    }

    getDateFormatted(format = this.config.format) {
      return this.dates.formattedArray(format).join(this.config.date.separator)
    }

    /**
     * resolve a new {DateArray}
     *
     * @param dates
     * @returns {DateArray}
     */
    configureNewDateArray(...dates) {
      if (dates.length > 0) {
        let newDatesArray = this.parseDates(...dates)
        newDatesArray = this.datesWithinRange(...newDatesArray)
        return new DateArray(...newDatesArray)
      }
      else {
        return new DateArray(...this.parseDateArrayFromInput())
        // already checks dates inside #parseDatesFromInput
      }
    }

    /**
     * @returns - array of UTC moments
     */
    parseDateArrayFromInput(){
      let value = this.$input.val()
      let dates

      if (value && this.config.date.count > 1) {
        dates = value.split(this.config.date.separator)
      }
      else {
        dates = [value]
      }
      dates = this.parseDates(...dates)
      dates = this.datesWithinRange(...dates)
      return dates
    }

    // ------------------------------------------------------------------------
    // static
    static _jQueryInterface(config) {
      //let methodResult = undefined
      return this.each(
        function () {
          let $element = $(this)
          let data = $element.data(Data.KEY)
          // Options priority: js args, data-attrs, Default const
          let _config = $.extend(
            {},
            Default,
            $element.data(),
            typeof config === 'object' && config  // config could be a string method name.
          )

          // instantiate a Datepicker or a DateRangePicker
          if (!data) {
            // FIXME: I really think this should be encapsulated in DateRangePicker, and not here.
            if ($element.hasClass('input-daterange') || _config.inputs) {
              data = new DateRangePicker($element,
                $.extend(_config, {inputs: _config.inputs || $element.find('input').toArray()})
              )
            }
            else {
              data = new Datepicker($element, _config)
            }
            $element.data(Data.KEY, data)
          }

          // call public methods jquery style
          if (typeof config === 'string') {
            if (data[config] === undefined) {
              throw new Error(`No method named "${config}"`)
            }
            //methodResult =
            data[config]()
          }
        }
      )

      //if (methodResult !== undefined) {
      //  // return method result if there is one
      //  return methodResult
      //}
      //else {
      //  // return the element
      //  return this
      //}
    }
  }

  /**
   * ------------------------------------------------------------------------
   * Data Api implementation
   * ------------------------------------------------------------------------
   */
  $(document).on(Event.CLICK_DATA_API, Selector.DATA_PROVIDE, function (event) {
    event.preventDefault()
    Datepicker._jQueryInterface.call(this, 'show')
  })

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
