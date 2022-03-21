$(document).ready(function(){

    let $faqTypeahead = $("#faq-typeahead"),
        $studentHelper = $("#student-helper"),
        $courseTypeAhead = $("input.course-typeahead"),
        $azTypeahead = $("input.az-typeahead"),
        $subjectTypeahead = $("input.subject-typeahead"),
        $subjectDatabaseTypeahead = $("input.database-subject-typeahead");

    // typeahead common options
    let buildtypeaheadOptions = function(count){
      count = count || 0;
      return {
        highlight: true,
        minLength: count,
        classNames: {
          highlight: "font-weight-bold",
          dataset: "tt-dataset list-group",
          menu: "tt-menu small text-dark scrollable",
          cursor: "tt-cursor"
        }
      };
    };

  // START LibAnswers FAQ Typeahead
  if ( $faqTypeahead.length ) {
    // Data source for ALL LibAnswers FAQs.
    let faqList = new Bloodhound({
      datumTokenizer: Bloodhound.tokenizers.obj.whitespace("question", "topics"),
      queryTokenizer: Bloodhound.tokenizers.whitespace,
      identify: function(obj) { return obj.question; },
      remote: {
        url: libutils.sprinshareUrls.answer_faqs,
        wildcard: "%QUERY",
        prepare: function(query, settings){
          settings.dataType = "jsonp";
          settings.url = settings.url.replace("%QUERY", query);
          return settings;
        },
        transform: function(response){

          let transformed = $.map(response.data.search.results, function (value) {
              let topicsArray =  $.map(value.topics, function(n,i){
                    return [ n ];
              });
              return {
                  id: value.id,
                  question: value.question,
                  topics: topicsArray.join(", "),
                  url: value.url
              };
          });
          return transformed;
        }
      }
    });

    // Setup typahead for subject typeahead.
    $faqTypeahead.typeahead( buildtypeaheadOptions(1), {
      name: "faqList",
      source: faqList,
      display: "question",
      limit: 200,
      templates: {
        suggestion: function(data) {
          return "<div class=\"list-group-item list-group-item-action\">" + data.question + "</div>";
        },
        header:function() {
          return "<div class=\"list-group-item list-group-item-info\">" +
          "Showing FAQs that contain one or more of your keywords. " +
          "Don't see a relevant question? Refine your terms or <a class=\"text-dark font-weight-bold\" href=\"/ask-us/\">Ask Us</a>.</div>";
        },
        notFound:function() {
          return "<div class=\"list-group-item list-group-item-dark\">Don't see what you're looking for?." +
          " <a class=\"text-dark font-weight-bold\" href=\"/ask-us/\">Ask Us</a> and we'll respond with 24-48 hours.</div>";
        }
      }
    }
    ).on("typeahead:selected", function(event, datum) {
        ga("send", "event", "link - typeahead", "faq", datum.question, { hitCallback: libutils.actWithTimeOut(function(){
         libutils.goToUrl(datum);
        })
     });
    });
  }
  // END LibAnswers FAQ Typeahead

  // Start subject listings
  if ( $subjectTypeahead.length || $subjectDatabaseTypeahead.length ) {

    // Data source for All LibGuides "subjects".
    let allSubjects = new Bloodhound({
      datumTokenizer: Bloodhound.tokenizers.obj.whitespace("name"),
      queryTokenizer: Bloodhound.tokenizers.whitespace,
      prefetch: {
        url: libutils.sprinshareUrls.subjects_list,
        cache: true,
        transform: function(response){
          let transformed = $.map(response, function (option) {
              return {
                  id: option.id,
                  name: option.name
              };
          });
          return transformed;
        }
      }
    });

    // Provide a default to subject queries. On focus of the input, search for pre-defined best bets, otherwise, just search.
    function subjectSearchWithDefaults(q, sync) {
      if (q === "") {
        sync(allSubjects.index.all());
      }
      else {
        allSubjects.search(q, sync);
      }
    }

    // Setup typahead for subject typeahead.
    $subjectTypeahead.typeahead( buildtypeaheadOptions(0),  {
      name: "allSubjects",
      source: subjectSearchWithDefaults,
      display: "name",
      limit: 200,
      templates: {
        suggestion: function(data) {
          return "<div class=\"list-group-item d-flex justify-content-between align-items-center\" role=\"link\"><div>" +
          data.name +
          "</div><i class=\"fas fa-external-link-alt\" aria-hidden=\"true\" title=\"external link to " + data.name + "\"></i></div>";
        }
      }
    }
    ).on("typeahead:selected", function(event, datum) {
      let path = "//guides.library.unt.edu/sb.php?subject_id=";
      ga("send", "event", "link - typeahead", "subjects", datum.name, { hitCallback: libutils.actWithTimeOut(function(){
          libutils.goToSubjectUrl(datum, path);
        })
      });
    });


    // Setup typahead for database subject listing.
    $subjectDatabaseTypeahead.typeahead( buildtypeaheadOptions(0),  {
      name: "allSubjects",
      source: subjectSearchWithDefaults,
      display: "name",
      limit: 200,
      templates: {
        suggestion: function(data) {
          return "<div class=\"list-group-item d-flex justify-content-between align-items-center\" role=\"link\"><div>" +
          data.name +
          "</div><i class=\"fas fa-external-link-alt\" aria-hidden=\"true\" title=\"external link to " + data.name + "\"></i></div>";
        }
      }
    }
    ).on("typeahead:selected", function(event, datum) {
      let path = "//guides.library.unt.edu/az.php?s=";
      ga("send", "event", "link - typeahead", "subjects - databases", datum.name, { hitCallback: libutils.actWithTimeOut(function(){
          libutils.goToSubjectUrl(datum, path);
        })
      });
    });
  }
  // End subject listings

  // Start databases typeahead
  if ( $azTypeahead.length ) {

    let azList,
        currentDate = new Date();

    function makeAZList(){
         // Data source for LibGuides powered A-Z Database listing.
        azList = new Bloodhound({
          datumTokenizer: Bloodhound.tokenizers.obj.whitespace("name", "description", "new", "trial", "subjects", "alt_names"),
          queryTokenizer: Bloodhound.tokenizers.whitespace,
          identify: function(obj) { return obj.id; },
          local: JSON.parse(sessionStorage.getItem('springshareAzWithSubjects')),
        });
        //console.log(azList);
        return azList;
    }
    // Provide a default to database queries. On focus of the input, search for pre-defined best bets, otherwise, just search.
    function databaseSearchWithDefaults(q, sync) {
      if (q === "") {
        sync(azList.get([2477452, 2478596, 2479459, 2477894, 2478101,2478940]));
        //"Academic Search Complete", "EBSCOhost", "JSTOR", "Nexis Uni", "ScienceDirect", "Web of Science"
      }
      else {
        azList.search(q, sync);
      }
    }


// Test if libguides database API response is in session storage or the data is older than 1 day.
if (sessionStorage.getItem("springshareAzWithSubjects") === null || currentDate.getTime() > sessionStorage.getItem('springshareAzExpires') ) {
  // JSON doesn't exists in Session Storage yet or the data is stale.

  // add a 'loading' placeholder
  $azTypeahead.attr("placeholder", "loading suggestions!");

  // Make a request against the API
  $.when($.get( libutils.sprinshareUrls.databases )).done((data) => {
    // Transform the Data
    let springshareTransformed = $.map(data, function (option) {
      let textDescription = option.description.replace(/<\/?[^>]+>/gi, '').replace(/"/g, "'"), // strip any markup in descriptions
          urlPath = ( !!+option.meta.enable_proxy ) ? "https://libproxy.library.unt.edu/login?url=" + option.url : option.url, // if proxy enabled, add it to the url, otherwise just the url
          recentlyAdded = (option.enable_new === 1) ? "recently added" : "", // boilerplate in searchable text for 'new' items
          isTrial = (option.enable_trial === 1) ? "under consideration" : "", // boilerplate in searchable text for 'trials'
          subjects = ( option.hasOwnProperty('subjects') ) ? option.subjects : [], // get subject object if it exists.
          subjectString = ( subjects.length ) ? "<br /><strong>Subjects: </strong>" : ""; // if exists, generate a prefix
          subjectString += subjects.map(function(subject){
              return subject.name;
          }).join(", "); // concat the prefix with a comma seperated subject list.

      return {
          id: option.id,
          name: option.name,
          description: textDescription,
          url: urlPath,
          new: recentlyAdded,
          trial: isTrial,
          subjects: subjectString,
          alt_names: option.alt_names
      };
    });
    // Add the transformed json to session storage
    sessionStorage.setItem('springshareAzWithSubjects', JSON.stringify(springshareTransformed));
    // calculate today + 24 hours and set that as a max cache time for the data, also to session strorage.
    let plusTwentyFour = currentDate.getTime() + 86400000;
    sessionStorage.setItem('springshareAzExpires', plusTwentyFour);
    
    // create bloodhound
    makeAZList();

    // update the placeholder with instructions.
    $azTypeahead.attr("placeholder", "type for suggestions");

  });

} else {
    // JSON already stored in session stroage, timestamp is less than 24 hours old; create bloodhound
    makeAZList();
}



    // Setup for the Datases Typeahead.
    $azTypeahead.typeahead( buildtypeaheadOptions(0), {
      name: "azList",
      minLength: 2,
      source: databaseSearchWithDefaults,
      limit: 50,
      display: "name",
      templates: {
        suggestion: function(data) {

          let isNew = (data.new) ? `<span class="badge badge-info small align-self-center">new</span>` : "",
              isTrial = (data.trial) ? `<span class="badge badge-info small align-self-center">trial</span>` : "";

          return `<div class="list-group-item d-flex" role="link"><div class="flex-grow-1">${data.name}</div>` +
          isNew + isTrial +
          `<i class="fas fa-info pl-3 d-none d-md-inline-block align-self-center" data-database="description" data-content="${data.description} ${data.subjects} " title="${data.name}" id="lg-id-${data.id}" aria-hidden="true"></i>` + 
          "</div>";
        },
        notFound: function(){
          return `<div class="list-group-item">No match found. Try alternatives or use fewer terms</div>`
        }
      }
    }).on("focusin", function(){
        $(this).attr("placeholder", "try these best bets or search for your own.");
    }).on("focusout", function(){
        $(this).attr("placeholder", "type for suggestions");
    }).on("typeahead:selected", function(event, datum) {
        ga("send", "event", "link - typeahead", "database", datum.name, { hitCallback: libutils.actWithTimeOut(function(){
         libutils.goToUrl(datum);
        })
     });
    });

    let $recentDBs = $("#recent-dbs"),
        $trialDBs = $("#trial-dbs");

    $recentDBs.on('click', function(e){
      e.preventDefault();
      $("#az-search").typeahead("val", "recently added").focus();
    });

    $trialDBs.on('click', function(e){
      e.preventDefault();
      $("#az-search").typeahead("val", "under consideration").focus();
    });


    let DBpopOverSettings = {
        container: 'body',
        trigger: 'hover',
        selector: '[data-database="description"]',
        boundary: 'viewport',
        placement: 'right',
        html: true
    };

    // highlight search string in popover
    $('div.database-group').popover(DBpopOverSettings)
       .on('inserted.bs.popover', function (e) {

          let searchVal = $(e.target).closest(".twitter-typeahead").find(".tt-input").val(),
              terms = searchVal.split(" "),
              $thisPopover = $("body").find(".popover-body");

              if (searchVal.length && window.Mark) {

                $thisPopover.mark(terms , {
                    "element": "strong",
                    "className": "text-success p-1"
                });


              }
       });
  }
  // End databases typeahead


  // Start Shared Bloodhound for course/guide listing
  if ( $studentHelper.length || $courseTypeAhead.length ) {

   // Data source for All LibGuides "guides".
    let allLibGuides = new Bloodhound({
      datumTokenizer: Bloodhound.tokenizers.obj.whitespace("name", "description", "subjects", "type_machine"),
      queryTokenizer: Bloodhound.tokenizers.whitespace,
      identify: function(obj) { return obj.name; },
      prefetch: {
        url: libutils.sprinshareUrls.guides_expand_owner_subject,
        cache: true,
        transform: function(response){
          let transformed = $.map(response, function (option) {
              let subjectsArray =  $.map(option.subjects, function(n,i){
                    return [ n.name ];
                  });
              return {
                  id: option.id,
                  name: option.name,
                  description: option.description,
                  url: option.friendly_url || option.url,
                  type_label: option.type_label,
                  type_machine: option.type_label.toLowerCase().replace(" ","-").concat("-",option.type_id),
                  subjects: subjectsArray.join(", ")
              };
          });
          return transformed;
        }
      }
    });

    // Provide a default to database queries. On focus of the input, search for pre-defined best bets, otherwise, just search.
    function coursesSource(q, sync) {
      allLibGuides.search(q + " course-guide-2", sync);
    }

    // Setup typahead for course finder
    $courseTypeAhead.typeahead( buildtypeaheadOptions(0),  {
      name: "coursesSource",
      source: coursesSource,
      display: "name",
      limit: 500,
      templates: {
        suggestion: function(data) {
          return "<div class=\"list-group-item d-flex justify-content-between align-items-center\" role=\"link\"><div>" +
          data.name +
          "</div><i class=\"fas fa-external-link-alt\" aria-hidden=\"true\" title=\"external link to " + data.name + "\"></i></div>";
        }
      }
    }
    ).on("typeahead:selected", function(event, datum) {
        ga("send", "event", "link - typeahead", "courses", datum.name, { hitCallback: libutils.actWithTimeOut(function(){
         libutils.goToUrl(datum);
        })
     });
    });


    // Data source for subject librarians in typeaheads.
    let librarians = new Bloodhound({
      datumTokenizer: Bloodhound.tokenizers.obj.whitespace("name", "job_title", "liaison_notes", "academic_units_string", "subjects"),
      queryTokenizer: Bloodhound.tokenizers.whitespace,
      prefetch: libutils.siteDomain + "/assets/data/subject-librarians.json"
    });


    // Setup typahead for homepage multi-source search box. Combines subject librarians, and guides into single output.
    $studentHelper.typeahead( buildtypeaheadOptions(0),  {
      name: "librarians",
      source: librarians,
      display: "name",
      templates: {
        suggestion: function(data) {
            return "<div class=\"list-group-item list-group-item-action d-flex align-items-center\"><div>" +
                    "<h5 class=\"h6\">" + data.name + " <small> &mdash; " + data.job_title + "</small></h5>" +
                    "<strong>Phone: </strong>" + data.phone + "<br />" +
                    "<strong>Serving: </strong>" + data.academic_units_served +
                    "</div><span class=\"ml-auto badge badge-dark\">subject librarian</span></div>" +
                    "</div>";
        }
      }
    },
    {
      name: "allLibGuides",
      source: allLibGuides,
      display: "name",
      limit: 20,
      templates: {
        suggestion: function(data) {

            let guideType, badgeType;

            if (data.type_label === "Course Guide") {
                badgeType = "info";
            } else {
                badgeType = "success";
            }

            return "<div class=\"list-group-item list-group-item-action d-flex align-items-center\"><div>" + data.name +
                    "</div><span class=\"ml-auto badge badge-" + badgeType + "\">" + data.type_label + "</span></div>";
        }
      }
    }
    ).on("typeahead:selected", function(event, datum) {
        ga("send", "event", "link - typeahead", "student helper - " + datum.type_label, datum.name, { hitCallback: libutils.actWithTimeOut(function(){
         libutils.goToUrl(datum);
        })
     });
    });
  }
  // End student helper typeahead (has multiple bloodhound sources)





});
//# sourceMappingURL=data:application/json;charset=utf8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbInR5cGVhaGVhZHMuanMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQSIsImZpbGUiOiJ0eXBlYWhlYWRzLmpzIiwic291cmNlc0NvbnRlbnQiOlsiJChkb2N1bWVudCkucmVhZHkoZnVuY3Rpb24oKXtcblxuICAgIGxldCAkZmFxVHlwZWFoZWFkID0gJChcIiNmYXEtdHlwZWFoZWFkXCIpLFxuICAgICAgICAkc3R1ZGVudEhlbHBlciA9ICQoXCIjc3R1ZGVudC1oZWxwZXJcIiksXG4gICAgICAgICRjb3Vyc2VUeXBlQWhlYWQgPSAkKFwiaW5wdXQuY291cnNlLXR5cGVhaGVhZFwiKSxcbiAgICAgICAgJGF6VHlwZWFoZWFkID0gJChcImlucHV0LmF6LXR5cGVhaGVhZFwiKSxcbiAgICAgICAgJHN1YmplY3RUeXBlYWhlYWQgPSAkKFwiaW5wdXQuc3ViamVjdC10eXBlYWhlYWRcIiksXG4gICAgICAgICRzdWJqZWN0RGF0YWJhc2VUeXBlYWhlYWQgPSAkKFwiaW5wdXQuZGF0YWJhc2Utc3ViamVjdC10eXBlYWhlYWRcIik7XG5cbiAgICAvLyB0eXBlYWhlYWQgY29tbW9uIG9wdGlvbnNcbiAgICBsZXQgYnVpbGR0eXBlYWhlYWRPcHRpb25zID0gZnVuY3Rpb24oY291bnQpe1xuICAgICAgY291bnQgPSBjb3VudCB8fCAwO1xuICAgICAgcmV0dXJuIHtcbiAgICAgICAgaGlnaGxpZ2h0OiB0cnVlLFxuICAgICAgICBtaW5MZW5ndGg6IGNvdW50LFxuICAgICAgICBjbGFzc05hbWVzOiB7XG4gICAgICAgICAgaGlnaGxpZ2h0OiBcImZvbnQtd2VpZ2h0LWJvbGRcIixcbiAgICAgICAgICBkYXRhc2V0OiBcInR0LWRhdGFzZXQgbGlzdC1ncm91cFwiLFxuICAgICAgICAgIG1lbnU6IFwidHQtbWVudSBzbWFsbCB0ZXh0LWRhcmsgc2Nyb2xsYWJsZVwiLFxuICAgICAgICAgIGN1cnNvcjogXCJ0dC1jdXJzb3JcIlxuICAgICAgICB9XG4gICAgICB9O1xuICAgIH07XG5cbiAgLy8gU1RBUlQgTGliQW5zd2VycyBGQVEgVHlwZWFoZWFkXG4gIGlmICggJGZhcVR5cGVhaGVhZC5sZW5ndGggKSB7XG4gICAgLy8gRGF0YSBzb3VyY2UgZm9yIEFMTCBMaWJBbnN3ZXJzIEZBUXMuXG4gICAgbGV0IGZhcUxpc3QgPSBuZXcgQmxvb2Rob3VuZCh7XG4gICAgICBkYXR1bVRva2VuaXplcjogQmxvb2Rob3VuZC50b2tlbml6ZXJzLm9iai53aGl0ZXNwYWNlKFwicXVlc3Rpb25cIiwgXCJ0b3BpY3NcIiksXG4gICAgICBxdWVyeVRva2VuaXplcjogQmxvb2Rob3VuZC50b2tlbml6ZXJzLndoaXRlc3BhY2UsXG4gICAgICBpZGVudGlmeTogZnVuY3Rpb24ob2JqKSB7IHJldHVybiBvYmoucXVlc3Rpb247IH0sXG4gICAgICByZW1vdGU6IHtcbiAgICAgICAgdXJsOiBsaWJ1dGlscy5zcHJpbnNoYXJlVXJscy5hbnN3ZXJfZmFxcyxcbiAgICAgICAgd2lsZGNhcmQ6IFwiJVFVRVJZXCIsXG4gICAgICAgIHByZXBhcmU6IGZ1bmN0aW9uKHF1ZXJ5LCBzZXR0aW5ncyl7XG4gICAgICAgICAgc2V0dGluZ3MuZGF0YVR5cGUgPSBcImpzb25wXCI7XG4gICAgICAgICAgc2V0dGluZ3MudXJsID0gc2V0dGluZ3MudXJsLnJlcGxhY2UoXCIlUVVFUllcIiwgcXVlcnkpO1xuICAgICAgICAgIHJldHVybiBzZXR0aW5ncztcbiAgICAgICAgfSxcbiAgICAgICAgdHJhbnNmb3JtOiBmdW5jdGlvbihyZXNwb25zZSl7XG5cbiAgICAgICAgICBsZXQgdHJhbnNmb3JtZWQgPSAkLm1hcChyZXNwb25zZS5kYXRhLnNlYXJjaC5yZXN1bHRzLCBmdW5jdGlvbiAodmFsdWUpIHtcbiAgICAgICAgICAgICAgbGV0IHRvcGljc0FycmF5ID0gICQubWFwKHZhbHVlLnRvcGljcywgZnVuY3Rpb24obixpKXtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIFsgbiBdO1xuICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgICAgICAgIGlkOiB2YWx1ZS5pZCxcbiAgICAgICAgICAgICAgICAgIHF1ZXN0aW9uOiB2YWx1ZS5xdWVzdGlvbixcbiAgICAgICAgICAgICAgICAgIHRvcGljczogdG9waWNzQXJyYXkuam9pbihcIiwgXCIpLFxuICAgICAgICAgICAgICAgICAgdXJsOiB2YWx1ZS51cmxcbiAgICAgICAgICAgICAgfTtcbiAgICAgICAgICB9KTtcbiAgICAgICAgICByZXR1cm4gdHJhbnNmb3JtZWQ7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9KTtcblxuICAgIC8vIFNldHVwIHR5cGFoZWFkIGZvciBzdWJqZWN0IHR5cGVhaGVhZC5cbiAgICAkZmFxVHlwZWFoZWFkLnR5cGVhaGVhZCggYnVpbGR0eXBlYWhlYWRPcHRpb25zKDEpLCB7XG4gICAgICBuYW1lOiBcImZhcUxpc3RcIixcbiAgICAgIHNvdXJjZTogZmFxTGlzdCxcbiAgICAgIGRpc3BsYXk6IFwicXVlc3Rpb25cIixcbiAgICAgIGxpbWl0OiAyMDAsXG4gICAgICB0ZW1wbGF0ZXM6IHtcbiAgICAgICAgc3VnZ2VzdGlvbjogZnVuY3Rpb24oZGF0YSkge1xuICAgICAgICAgIHJldHVybiBcIjxkaXYgY2xhc3M9XFxcImxpc3QtZ3JvdXAtaXRlbSBsaXN0LWdyb3VwLWl0ZW0tYWN0aW9uXFxcIj5cIiArIGRhdGEucXVlc3Rpb24gKyBcIjwvZGl2PlwiO1xuICAgICAgICB9LFxuICAgICAgICBoZWFkZXI6ZnVuY3Rpb24oKSB7XG4gICAgICAgICAgcmV0dXJuIFwiPGRpdiBjbGFzcz1cXFwibGlzdC1ncm91cC1pdGVtIGxpc3QtZ3JvdXAtaXRlbS1pbmZvXFxcIj5cIiArXG4gICAgICAgICAgXCJTaG93aW5nIEZBUXMgdGhhdCBjb250YWluIG9uZSBvciBtb3JlIG9mIHlvdXIga2V5d29yZHMuIFwiICtcbiAgICAgICAgICBcIkRvbid0IHNlZSBhIHJlbGV2YW50IHF1ZXN0aW9uPyBSZWZpbmUgeW91ciB0ZXJtcyBvciA8YSBjbGFzcz1cXFwidGV4dC1kYXJrIGZvbnQtd2VpZ2h0LWJvbGRcXFwiIGhyZWY9XFxcIi9hc2stdXMvXFxcIj5Bc2sgVXM8L2E+LjwvZGl2PlwiO1xuICAgICAgICB9LFxuICAgICAgICBub3RGb3VuZDpmdW5jdGlvbigpIHtcbiAgICAgICAgICByZXR1cm4gXCI8ZGl2IGNsYXNzPVxcXCJsaXN0LWdyb3VwLWl0ZW0gbGlzdC1ncm91cC1pdGVtLWRhcmtcXFwiPkRvbid0IHNlZSB3aGF0IHlvdSdyZSBsb29raW5nIGZvcj8uXCIgK1xuICAgICAgICAgIFwiIDxhIGNsYXNzPVxcXCJ0ZXh0LWRhcmsgZm9udC13ZWlnaHQtYm9sZFxcXCIgaHJlZj1cXFwiL2Fzay11cy9cXFwiPkFzayBVczwvYT4gYW5kIHdlJ2xsIHJlc3BvbmQgd2l0aCAyNC00OCBob3Vycy48L2Rpdj5cIjtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cbiAgICApLm9uKFwidHlwZWFoZWFkOnNlbGVjdGVkXCIsIGZ1bmN0aW9uKGV2ZW50LCBkYXR1bSkge1xuICAgICAgICBnYShcInNlbmRcIiwgXCJldmVudFwiLCBcImxpbmsgLSB0eXBlYWhlYWRcIiwgXCJmYXFcIiwgZGF0dW0ucXVlc3Rpb24sIHsgaGl0Q2FsbGJhY2s6IGxpYnV0aWxzLmFjdFdpdGhUaW1lT3V0KGZ1bmN0aW9uKCl7XG4gICAgICAgICBsaWJ1dGlscy5nb1RvVXJsKGRhdHVtKTtcbiAgICAgICAgfSlcbiAgICAgfSk7XG4gICAgfSk7XG4gIH1cbiAgLy8gRU5EIExpYkFuc3dlcnMgRkFRIFR5cGVhaGVhZFxuXG4gIC8vIFN0YXJ0IHN1YmplY3QgbGlzdGluZ3NcbiAgaWYgKCAkc3ViamVjdFR5cGVhaGVhZC5sZW5ndGggfHwgJHN1YmplY3REYXRhYmFzZVR5cGVhaGVhZC5sZW5ndGggKSB7XG5cbiAgICAvLyBEYXRhIHNvdXJjZSBmb3IgQWxsIExpYkd1aWRlcyBcInN1YmplY3RzXCIuXG4gICAgbGV0IGFsbFN1YmplY3RzID0gbmV3IEJsb29kaG91bmQoe1xuICAgICAgZGF0dW1Ub2tlbml6ZXI6IEJsb29kaG91bmQudG9rZW5pemVycy5vYmoud2hpdGVzcGFjZShcIm5hbWVcIiksXG4gICAgICBxdWVyeVRva2VuaXplcjogQmxvb2Rob3VuZC50b2tlbml6ZXJzLndoaXRlc3BhY2UsXG4gICAgICBwcmVmZXRjaDoge1xuICAgICAgICB1cmw6IGxpYnV0aWxzLnNwcmluc2hhcmVVcmxzLnN1YmplY3RzX2xpc3QsXG4gICAgICAgIGNhY2hlOiB0cnVlLFxuICAgICAgICB0cmFuc2Zvcm06IGZ1bmN0aW9uKHJlc3BvbnNlKXtcbiAgICAgICAgICBsZXQgdHJhbnNmb3JtZWQgPSAkLm1hcChyZXNwb25zZSwgZnVuY3Rpb24gKG9wdGlvbikge1xuICAgICAgICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgICAgICAgaWQ6IG9wdGlvbi5pZCxcbiAgICAgICAgICAgICAgICAgIG5hbWU6IG9wdGlvbi5uYW1lXG4gICAgICAgICAgICAgIH07XG4gICAgICAgICAgfSk7XG4gICAgICAgICAgcmV0dXJuIHRyYW5zZm9ybWVkO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfSk7XG5cbiAgICAvLyBQcm92aWRlIGEgZGVmYXVsdCB0byBzdWJqZWN0IHF1ZXJpZXMuIE9uIGZvY3VzIG9mIHRoZSBpbnB1dCwgc2VhcmNoIGZvciBwcmUtZGVmaW5lZCBiZXN0IGJldHMsIG90aGVyd2lzZSwganVzdCBzZWFyY2guXG4gICAgZnVuY3Rpb24gc3ViamVjdFNlYXJjaFdpdGhEZWZhdWx0cyhxLCBzeW5jKSB7XG4gICAgICBpZiAocSA9PT0gXCJcIikge1xuICAgICAgICBzeW5jKGFsbFN1YmplY3RzLmluZGV4LmFsbCgpKTtcbiAgICAgIH1cbiAgICAgIGVsc2Uge1xuICAgICAgICBhbGxTdWJqZWN0cy5zZWFyY2gocSwgc3luYyk7XG4gICAgICB9XG4gICAgfVxuXG4gICAgLy8gU2V0dXAgdHlwYWhlYWQgZm9yIHN1YmplY3QgdHlwZWFoZWFkLlxuICAgICRzdWJqZWN0VHlwZWFoZWFkLnR5cGVhaGVhZCggYnVpbGR0eXBlYWhlYWRPcHRpb25zKDApLCAge1xuICAgICAgbmFtZTogXCJhbGxTdWJqZWN0c1wiLFxuICAgICAgc291cmNlOiBzdWJqZWN0U2VhcmNoV2l0aERlZmF1bHRzLFxuICAgICAgZGlzcGxheTogXCJuYW1lXCIsXG4gICAgICBsaW1pdDogMjAwLFxuICAgICAgdGVtcGxhdGVzOiB7XG4gICAgICAgIHN1Z2dlc3Rpb246IGZ1bmN0aW9uKGRhdGEpIHtcbiAgICAgICAgICByZXR1cm4gXCI8ZGl2IGNsYXNzPVxcXCJsaXN0LWdyb3VwLWl0ZW0gZC1mbGV4IGp1c3RpZnktY29udGVudC1iZXR3ZWVuIGFsaWduLWl0ZW1zLWNlbnRlclxcXCIgcm9sZT1cXFwibGlua1xcXCI+PGRpdj5cIiArXG4gICAgICAgICAgZGF0YS5uYW1lICtcbiAgICAgICAgICBcIjwvZGl2PjxpIGNsYXNzPVxcXCJmYXMgZmEtZXh0ZXJuYWwtbGluay1hbHRcXFwiIGFyaWEtaGlkZGVuPVxcXCJ0cnVlXFxcIiB0aXRsZT1cXFwiZXh0ZXJuYWwgbGluayB0byBcIiArIGRhdGEubmFtZSArIFwiXFxcIj48L2k+PC9kaXY+XCI7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG4gICAgKS5vbihcInR5cGVhaGVhZDpzZWxlY3RlZFwiLCBmdW5jdGlvbihldmVudCwgZGF0dW0pIHtcbiAgICAgIGxldCBwYXRoID0gXCIvL2d1aWRlcy5saWJyYXJ5LnVudC5lZHUvc2IucGhwP3N1YmplY3RfaWQ9XCI7XG4gICAgICBnYShcInNlbmRcIiwgXCJldmVudFwiLCBcImxpbmsgLSB0eXBlYWhlYWRcIiwgXCJzdWJqZWN0c1wiLCBkYXR1bS5uYW1lLCB7IGhpdENhbGxiYWNrOiBsaWJ1dGlscy5hY3RXaXRoVGltZU91dChmdW5jdGlvbigpe1xuICAgICAgICAgIGxpYnV0aWxzLmdvVG9TdWJqZWN0VXJsKGRhdHVtLCBwYXRoKTtcbiAgICAgICAgfSlcbiAgICAgIH0pO1xuICAgIH0pO1xuXG5cbiAgICAvLyBTZXR1cCB0eXBhaGVhZCBmb3IgZGF0YWJhc2Ugc3ViamVjdCBsaXN0aW5nLlxuICAgICRzdWJqZWN0RGF0YWJhc2VUeXBlYWhlYWQudHlwZWFoZWFkKCBidWlsZHR5cGVhaGVhZE9wdGlvbnMoMCksICB7XG4gICAgICBuYW1lOiBcImFsbFN1YmplY3RzXCIsXG4gICAgICBzb3VyY2U6IHN1YmplY3RTZWFyY2hXaXRoRGVmYXVsdHMsXG4gICAgICBkaXNwbGF5OiBcIm5hbWVcIixcbiAgICAgIGxpbWl0OiAyMDAsXG4gICAgICB0ZW1wbGF0ZXM6IHtcbiAgICAgICAgc3VnZ2VzdGlvbjogZnVuY3Rpb24oZGF0YSkge1xuICAgICAgICAgIHJldHVybiBcIjxkaXYgY2xhc3M9XFxcImxpc3QtZ3JvdXAtaXRlbSBkLWZsZXgganVzdGlmeS1jb250ZW50LWJldHdlZW4gYWxpZ24taXRlbXMtY2VudGVyXFxcIiByb2xlPVxcXCJsaW5rXFxcIj48ZGl2PlwiICtcbiAgICAgICAgICBkYXRhLm5hbWUgK1xuICAgICAgICAgIFwiPC9kaXY+PGkgY2xhc3M9XFxcImZhcyBmYS1leHRlcm5hbC1saW5rLWFsdFxcXCIgYXJpYS1oaWRkZW49XFxcInRydWVcXFwiIHRpdGxlPVxcXCJleHRlcm5hbCBsaW5rIHRvIFwiICsgZGF0YS5uYW1lICsgXCJcXFwiPjwvaT48L2Rpdj5cIjtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cbiAgICApLm9uKFwidHlwZWFoZWFkOnNlbGVjdGVkXCIsIGZ1bmN0aW9uKGV2ZW50LCBkYXR1bSkge1xuICAgICAgbGV0IHBhdGggPSBcIi8vZ3VpZGVzLmxpYnJhcnkudW50LmVkdS9hei5waHA/cz1cIjtcbiAgICAgIGdhKFwic2VuZFwiLCBcImV2ZW50XCIsIFwibGluayAtIHR5cGVhaGVhZFwiLCBcInN1YmplY3RzIC0gZGF0YWJhc2VzXCIsIGRhdHVtLm5hbWUsIHsgaGl0Q2FsbGJhY2s6IGxpYnV0aWxzLmFjdFdpdGhUaW1lT3V0KGZ1bmN0aW9uKCl7XG4gICAgICAgICAgbGlidXRpbHMuZ29Ub1N1YmplY3RVcmwoZGF0dW0sIHBhdGgpO1xuICAgICAgICB9KVxuICAgICAgfSk7XG4gICAgfSk7XG4gIH1cbiAgLy8gRW5kIHN1YmplY3QgbGlzdGluZ3NcblxuICAvLyBTdGFydCBkYXRhYmFzZXMgdHlwZWFoZWFkXG4gIGlmICggJGF6VHlwZWFoZWFkLmxlbmd0aCApIHtcblxuICAgIGxldCBhekxpc3QsXG4gICAgICAgIGN1cnJlbnREYXRlID0gbmV3IERhdGUoKTtcblxuICAgIGZ1bmN0aW9uIG1ha2VBWkxpc3QoKXtcbiAgICAgICAgIC8vIERhdGEgc291cmNlIGZvciBMaWJHdWlkZXMgcG93ZXJlZCBBLVogRGF0YWJhc2UgbGlzdGluZy5cbiAgICAgICAgYXpMaXN0ID0gbmV3IEJsb29kaG91bmQoe1xuICAgICAgICAgIGRhdHVtVG9rZW5pemVyOiBCbG9vZGhvdW5kLnRva2VuaXplcnMub2JqLndoaXRlc3BhY2UoXCJuYW1lXCIsIFwiZGVzY3JpcHRpb25cIiwgXCJuZXdcIiwgXCJ0cmlhbFwiLCBcInN1YmplY3RzXCIsIFwiYWx0X25hbWVzXCIpLFxuICAgICAgICAgIHF1ZXJ5VG9rZW5pemVyOiBCbG9vZGhvdW5kLnRva2VuaXplcnMud2hpdGVzcGFjZSxcbiAgICAgICAgICBpZGVudGlmeTogZnVuY3Rpb24ob2JqKSB7IHJldHVybiBvYmouaWQ7IH0sXG4gICAgICAgICAgbG9jYWw6IEpTT04ucGFyc2Uoc2Vzc2lvblN0b3JhZ2UuZ2V0SXRlbSgnc3ByaW5nc2hhcmVBeldpdGhTdWJqZWN0cycpKSxcbiAgICAgICAgfSk7XG4gICAgICAgIC8vY29uc29sZS5sb2coYXpMaXN0KTtcbiAgICAgICAgcmV0dXJuIGF6TGlzdDtcbiAgICB9XG4gICAgLy8gUHJvdmlkZSBhIGRlZmF1bHQgdG8gZGF0YWJhc2UgcXVlcmllcy4gT24gZm9jdXMgb2YgdGhlIGlucHV0LCBzZWFyY2ggZm9yIHByZS1kZWZpbmVkIGJlc3QgYmV0cywgb3RoZXJ3aXNlLCBqdXN0IHNlYXJjaC5cbiAgICBmdW5jdGlvbiBkYXRhYmFzZVNlYXJjaFdpdGhEZWZhdWx0cyhxLCBzeW5jKSB7XG4gICAgICBpZiAocSA9PT0gXCJcIikge1xuICAgICAgICBzeW5jKGF6TGlzdC5nZXQoWzI0Nzc0NTIsIDI0Nzg1OTYsIDI0Nzk0NTksIDI0Nzc4OTQsIDI0NzgxMDEsMjQ3ODk0MF0pKTtcbiAgICAgICAgLy9cIkFjYWRlbWljIFNlYXJjaCBDb21wbGV0ZVwiLCBcIkVCU0NPaG9zdFwiLCBcIkpTVE9SXCIsIFwiTmV4aXMgVW5pXCIsIFwiU2NpZW5jZURpcmVjdFwiLCBcIldlYiBvZiBTY2llbmNlXCJcbiAgICAgIH1cbiAgICAgIGVsc2Uge1xuICAgICAgICBhekxpc3Quc2VhcmNoKHEsIHN5bmMpO1xuICAgICAgfVxuICAgIH1cblxuXG4vLyBUZXN0IGlmIGxpYmd1aWRlcyBkYXRhYmFzZSBBUEkgcmVzcG9uc2UgaXMgaW4gc2Vzc2lvbiBzdG9yYWdlIG9yIHRoZSBkYXRhIGlzIG9sZGVyIHRoYW4gMSBkYXkuXG5pZiAoc2Vzc2lvblN0b3JhZ2UuZ2V0SXRlbShcInNwcmluZ3NoYXJlQXpXaXRoU3ViamVjdHNcIikgPT09IG51bGwgfHwgY3VycmVudERhdGUuZ2V0VGltZSgpID4gc2Vzc2lvblN0b3JhZ2UuZ2V0SXRlbSgnc3ByaW5nc2hhcmVBekV4cGlyZXMnKSApIHtcbiAgLy8gSlNPTiBkb2Vzbid0IGV4aXN0cyBpbiBTZXNzaW9uIFN0b3JhZ2UgeWV0IG9yIHRoZSBkYXRhIGlzIHN0YWxlLlxuXG4gIC8vIGFkZCBhICdsb2FkaW5nJyBwbGFjZWhvbGRlclxuICAkYXpUeXBlYWhlYWQuYXR0cihcInBsYWNlaG9sZGVyXCIsIFwibG9hZGluZyBzdWdnZXN0aW9ucyFcIik7XG5cbiAgLy8gTWFrZSBhIHJlcXVlc3QgYWdhaW5zdCB0aGUgQVBJXG4gICQud2hlbigkLmdldCggbGlidXRpbHMuc3ByaW5zaGFyZVVybHMuZGF0YWJhc2VzICkpLmRvbmUoKGRhdGEpID0+IHtcbiAgICAvLyBUcmFuc2Zvcm0gdGhlIERhdGFcbiAgICBsZXQgc3ByaW5nc2hhcmVUcmFuc2Zvcm1lZCA9ICQubWFwKGRhdGEsIGZ1bmN0aW9uIChvcHRpb24pIHtcbiAgICAgIGxldCB0ZXh0RGVzY3JpcHRpb24gPSBvcHRpb24uZGVzY3JpcHRpb24ucmVwbGFjZSgvPFxcLz9bXj5dKz4vZ2ksICcnKS5yZXBsYWNlKC9cIi9nLCBcIidcIiksIC8vIHN0cmlwIGFueSBtYXJrdXAgaW4gZGVzY3JpcHRpb25zXG4gICAgICAgICAgdXJsUGF0aCA9ICggISErb3B0aW9uLm1ldGEuZW5hYmxlX3Byb3h5ICkgPyBcImh0dHBzOi8vbGlicHJveHkubGlicmFyeS51bnQuZWR1L2xvZ2luP3VybD1cIiArIG9wdGlvbi51cmwgOiBvcHRpb24udXJsLCAvLyBpZiBwcm94eSBlbmFibGVkLCBhZGQgaXQgdG8gdGhlIHVybCwgb3RoZXJ3aXNlIGp1c3QgdGhlIHVybFxuICAgICAgICAgIHJlY2VudGx5QWRkZWQgPSAob3B0aW9uLmVuYWJsZV9uZXcgPT09IDEpID8gXCJyZWNlbnRseSBhZGRlZFwiIDogXCJcIiwgLy8gYm9pbGVycGxhdGUgaW4gc2VhcmNoYWJsZSB0ZXh0IGZvciAnbmV3JyBpdGVtc1xuICAgICAgICAgIGlzVHJpYWwgPSAob3B0aW9uLmVuYWJsZV90cmlhbCA9PT0gMSkgPyBcInVuZGVyIGNvbnNpZGVyYXRpb25cIiA6IFwiXCIsIC8vIGJvaWxlcnBsYXRlIGluIHNlYXJjaGFibGUgdGV4dCBmb3IgJ3RyaWFscydcbiAgICAgICAgICBzdWJqZWN0cyA9ICggb3B0aW9uLmhhc093blByb3BlcnR5KCdzdWJqZWN0cycpICkgPyBvcHRpb24uc3ViamVjdHMgOiBbXSwgLy8gZ2V0IHN1YmplY3Qgb2JqZWN0IGlmIGl0IGV4aXN0cy5cbiAgICAgICAgICBzdWJqZWN0U3RyaW5nID0gKCBzdWJqZWN0cy5sZW5ndGggKSA/IFwiPGJyIC8+PHN0cm9uZz5TdWJqZWN0czogPC9zdHJvbmc+XCIgOiBcIlwiOyAvLyBpZiBleGlzdHMsIGdlbmVyYXRlIGEgcHJlZml4XG4gICAgICAgICAgc3ViamVjdFN0cmluZyArPSBzdWJqZWN0cy5tYXAoZnVuY3Rpb24oc3ViamVjdCl7XG4gICAgICAgICAgICAgIHJldHVybiBzdWJqZWN0Lm5hbWU7XG4gICAgICAgICAgfSkuam9pbihcIiwgXCIpOyAvLyBjb25jYXQgdGhlIHByZWZpeCB3aXRoIGEgY29tbWEgc2VwZXJhdGVkIHN1YmplY3QgbGlzdC5cblxuICAgICAgcmV0dXJuIHtcbiAgICAgICAgICBpZDogb3B0aW9uLmlkLFxuICAgICAgICAgIG5hbWU6IG9wdGlvbi5uYW1lLFxuICAgICAgICAgIGRlc2NyaXB0aW9uOiB0ZXh0RGVzY3JpcHRpb24sXG4gICAgICAgICAgdXJsOiB1cmxQYXRoLFxuICAgICAgICAgIG5ldzogcmVjZW50bHlBZGRlZCxcbiAgICAgICAgICB0cmlhbDogaXNUcmlhbCxcbiAgICAgICAgICBzdWJqZWN0czogc3ViamVjdFN0cmluZyxcbiAgICAgICAgICBhbHRfbmFtZXM6IG9wdGlvbi5hbHRfbmFtZXNcbiAgICAgIH07XG4gICAgfSk7XG4gICAgLy8gQWRkIHRoZSB0cmFuc2Zvcm1lZCBqc29uIHRvIHNlc3Npb24gc3RvcmFnZVxuICAgIHNlc3Npb25TdG9yYWdlLnNldEl0ZW0oJ3NwcmluZ3NoYXJlQXpXaXRoU3ViamVjdHMnLCBKU09OLnN0cmluZ2lmeShzcHJpbmdzaGFyZVRyYW5zZm9ybWVkKSk7XG4gICAgLy8gY2FsY3VsYXRlIHRvZGF5ICsgMjQgaG91cnMgYW5kIHNldCB0aGF0IGFzIGEgbWF4IGNhY2hlIHRpbWUgZm9yIHRoZSBkYXRhLCBhbHNvIHRvIHNlc3Npb24gc3Ryb3JhZ2UuXG4gICAgbGV0IHBsdXNUd2VudHlGb3VyID0gY3VycmVudERhdGUuZ2V0VGltZSgpICsgODY0MDAwMDA7XG4gICAgc2Vzc2lvblN0b3JhZ2Uuc2V0SXRlbSgnc3ByaW5nc2hhcmVBekV4cGlyZXMnLCBwbHVzVHdlbnR5Rm91cik7XG4gICAgXG4gICAgLy8gY3JlYXRlIGJsb29kaG91bmRcbiAgICBtYWtlQVpMaXN0KCk7XG5cbiAgICAvLyB1cGRhdGUgdGhlIHBsYWNlaG9sZGVyIHdpdGggaW5zdHJ1Y3Rpb25zLlxuICAgICRhelR5cGVhaGVhZC5hdHRyKFwicGxhY2Vob2xkZXJcIiwgXCJ0eXBlIGZvciBzdWdnZXN0aW9uc1wiKTtcblxuICB9KTtcblxufSBlbHNlIHtcbiAgICAvLyBKU09OIGFscmVhZHkgc3RvcmVkIGluIHNlc3Npb24gc3Ryb2FnZSwgdGltZXN0YW1wIGlzIGxlc3MgdGhhbiAyNCBob3VycyBvbGQ7IGNyZWF0ZSBibG9vZGhvdW5kXG4gICAgbWFrZUFaTGlzdCgpO1xufVxuXG5cblxuICAgIC8vIFNldHVwIGZvciB0aGUgRGF0YXNlcyBUeXBlYWhlYWQuXG4gICAgJGF6VHlwZWFoZWFkLnR5cGVhaGVhZCggYnVpbGR0eXBlYWhlYWRPcHRpb25zKDApLCB7XG4gICAgICBuYW1lOiBcImF6TGlzdFwiLFxuICAgICAgbWluTGVuZ3RoOiAyLFxuICAgICAgc291cmNlOiBkYXRhYmFzZVNlYXJjaFdpdGhEZWZhdWx0cyxcbiAgICAgIGxpbWl0OiA1MCxcbiAgICAgIGRpc3BsYXk6IFwibmFtZVwiLFxuICAgICAgdGVtcGxhdGVzOiB7XG4gICAgICAgIHN1Z2dlc3Rpb246IGZ1bmN0aW9uKGRhdGEpIHtcblxuICAgICAgICAgIGxldCBpc05ldyA9IChkYXRhLm5ldykgPyBgPHNwYW4gY2xhc3M9XCJiYWRnZSBiYWRnZS1pbmZvIHNtYWxsIGFsaWduLXNlbGYtY2VudGVyXCI+bmV3PC9zcGFuPmAgOiBcIlwiLFxuICAgICAgICAgICAgICBpc1RyaWFsID0gKGRhdGEudHJpYWwpID8gYDxzcGFuIGNsYXNzPVwiYmFkZ2UgYmFkZ2UtaW5mbyBzbWFsbCBhbGlnbi1zZWxmLWNlbnRlclwiPnRyaWFsPC9zcGFuPmAgOiBcIlwiO1xuXG4gICAgICAgICAgcmV0dXJuIGA8ZGl2IGNsYXNzPVwibGlzdC1ncm91cC1pdGVtIGQtZmxleFwiIHJvbGU9XCJsaW5rXCI+PGRpdiBjbGFzcz1cImZsZXgtZ3Jvdy0xXCI+JHtkYXRhLm5hbWV9PC9kaXY+YCArXG4gICAgICAgICAgaXNOZXcgKyBpc1RyaWFsICtcbiAgICAgICAgICBgPGkgY2xhc3M9XCJmYXMgZmEtaW5mbyBwbC0zIGQtbm9uZSBkLW1kLWlubGluZS1ibG9jayBhbGlnbi1zZWxmLWNlbnRlclwiIGRhdGEtZGF0YWJhc2U9XCJkZXNjcmlwdGlvblwiIGRhdGEtY29udGVudD1cIiR7ZGF0YS5kZXNjcmlwdGlvbn0gJHtkYXRhLnN1YmplY3RzfSBcIiB0aXRsZT1cIiR7ZGF0YS5uYW1lfVwiIGlkPVwibGctaWQtJHtkYXRhLmlkfVwiIGFyaWEtaGlkZGVuPVwidHJ1ZVwiPjwvaT5gICsgXG4gICAgICAgICAgXCI8L2Rpdj5cIjtcbiAgICAgICAgfSxcbiAgICAgICAgbm90Rm91bmQ6IGZ1bmN0aW9uKCl7XG4gICAgICAgICAgcmV0dXJuIGA8ZGl2IGNsYXNzPVwibGlzdC1ncm91cC1pdGVtXCI+Tm8gbWF0Y2ggZm91bmQuIFRyeSBhbHRlcm5hdGl2ZXMgb3IgdXNlIGZld2VyIHRlcm1zPC9kaXY+YFxuICAgICAgICB9XG4gICAgICB9XG4gICAgfSkub24oXCJmb2N1c2luXCIsIGZ1bmN0aW9uKCl7XG4gICAgICAgICQodGhpcykuYXR0cihcInBsYWNlaG9sZGVyXCIsIFwidHJ5IHRoZXNlIGJlc3QgYmV0cyBvciBzZWFyY2ggZm9yIHlvdXIgb3duLlwiKTtcbiAgICB9KS5vbihcImZvY3Vzb3V0XCIsIGZ1bmN0aW9uKCl7XG4gICAgICAgICQodGhpcykuYXR0cihcInBsYWNlaG9sZGVyXCIsIFwidHlwZSBmb3Igc3VnZ2VzdGlvbnNcIik7XG4gICAgfSkub24oXCJ0eXBlYWhlYWQ6c2VsZWN0ZWRcIiwgZnVuY3Rpb24oZXZlbnQsIGRhdHVtKSB7XG4gICAgICAgIGdhKFwic2VuZFwiLCBcImV2ZW50XCIsIFwibGluayAtIHR5cGVhaGVhZFwiLCBcImRhdGFiYXNlXCIsIGRhdHVtLm5hbWUsIHsgaGl0Q2FsbGJhY2s6IGxpYnV0aWxzLmFjdFdpdGhUaW1lT3V0KGZ1bmN0aW9uKCl7XG4gICAgICAgICBsaWJ1dGlscy5nb1RvVXJsKGRhdHVtKTtcbiAgICAgICAgfSlcbiAgICAgfSk7XG4gICAgfSk7XG5cbiAgICBsZXQgJHJlY2VudERCcyA9ICQoXCIjcmVjZW50LWRic1wiKSxcbiAgICAgICAgJHRyaWFsREJzID0gJChcIiN0cmlhbC1kYnNcIik7XG5cbiAgICAkcmVjZW50REJzLm9uKCdjbGljaycsIGZ1bmN0aW9uKGUpe1xuICAgICAgZS5wcmV2ZW50RGVmYXVsdCgpO1xuICAgICAgJChcIiNhei1zZWFyY2hcIikudHlwZWFoZWFkKFwidmFsXCIsIFwicmVjZW50bHkgYWRkZWRcIikuZm9jdXMoKTtcbiAgICB9KTtcblxuICAgICR0cmlhbERCcy5vbignY2xpY2snLCBmdW5jdGlvbihlKXtcbiAgICAgIGUucHJldmVudERlZmF1bHQoKTtcbiAgICAgICQoXCIjYXotc2VhcmNoXCIpLnR5cGVhaGVhZChcInZhbFwiLCBcInVuZGVyIGNvbnNpZGVyYXRpb25cIikuZm9jdXMoKTtcbiAgICB9KTtcblxuXG4gICAgbGV0IERCcG9wT3ZlclNldHRpbmdzID0ge1xuICAgICAgICBjb250YWluZXI6ICdib2R5JyxcbiAgICAgICAgdHJpZ2dlcjogJ2hvdmVyJyxcbiAgICAgICAgc2VsZWN0b3I6ICdbZGF0YS1kYXRhYmFzZT1cImRlc2NyaXB0aW9uXCJdJyxcbiAgICAgICAgYm91bmRhcnk6ICd2aWV3cG9ydCcsXG4gICAgICAgIHBsYWNlbWVudDogJ3JpZ2h0JyxcbiAgICAgICAgaHRtbDogdHJ1ZVxuICAgIH07XG5cbiAgICAvLyBoaWdobGlnaHQgc2VhcmNoIHN0cmluZyBpbiBwb3BvdmVyXG4gICAgJCgnZGl2LmRhdGFiYXNlLWdyb3VwJykucG9wb3ZlcihEQnBvcE92ZXJTZXR0aW5ncylcbiAgICAgICAub24oJ2luc2VydGVkLmJzLnBvcG92ZXInLCBmdW5jdGlvbiAoZSkge1xuXG4gICAgICAgICAgbGV0IHNlYXJjaFZhbCA9ICQoZS50YXJnZXQpLmNsb3Nlc3QoXCIudHdpdHRlci10eXBlYWhlYWRcIikuZmluZChcIi50dC1pbnB1dFwiKS52YWwoKSxcbiAgICAgICAgICAgICAgdGVybXMgPSBzZWFyY2hWYWwuc3BsaXQoXCIgXCIpLFxuICAgICAgICAgICAgICAkdGhpc1BvcG92ZXIgPSAkKFwiYm9keVwiKS5maW5kKFwiLnBvcG92ZXItYm9keVwiKTtcblxuICAgICAgICAgICAgICBpZiAoc2VhcmNoVmFsLmxlbmd0aCAmJiB3aW5kb3cuTWFyaykge1xuXG4gICAgICAgICAgICAgICAgJHRoaXNQb3BvdmVyLm1hcmsodGVybXMgLCB7XG4gICAgICAgICAgICAgICAgICAgIFwiZWxlbWVudFwiOiBcInN0cm9uZ1wiLFxuICAgICAgICAgICAgICAgICAgICBcImNsYXNzTmFtZVwiOiBcInRleHQtc3VjY2VzcyBwLTFcIlxuICAgICAgICAgICAgICAgIH0pO1xuXG5cbiAgICAgICAgICAgICAgfVxuICAgICAgIH0pO1xuICB9XG4gIC8vIEVuZCBkYXRhYmFzZXMgdHlwZWFoZWFkXG5cblxuICAvLyBTdGFydCBTaGFyZWQgQmxvb2Rob3VuZCBmb3IgY291cnNlL2d1aWRlIGxpc3RpbmdcbiAgaWYgKCAkc3R1ZGVudEhlbHBlci5sZW5ndGggfHwgJGNvdXJzZVR5cGVBaGVhZC5sZW5ndGggKSB7XG5cbiAgIC8vIERhdGEgc291cmNlIGZvciBBbGwgTGliR3VpZGVzIFwiZ3VpZGVzXCIuXG4gICAgbGV0IGFsbExpYkd1aWRlcyA9IG5ldyBCbG9vZGhvdW5kKHtcbiAgICAgIGRhdHVtVG9rZW5pemVyOiBCbG9vZGhvdW5kLnRva2VuaXplcnMub2JqLndoaXRlc3BhY2UoXCJuYW1lXCIsIFwiZGVzY3JpcHRpb25cIiwgXCJzdWJqZWN0c1wiLCBcInR5cGVfbWFjaGluZVwiKSxcbiAgICAgIHF1ZXJ5VG9rZW5pemVyOiBCbG9vZGhvdW5kLnRva2VuaXplcnMud2hpdGVzcGFjZSxcbiAgICAgIGlkZW50aWZ5OiBmdW5jdGlvbihvYmopIHsgcmV0dXJuIG9iai5uYW1lOyB9LFxuICAgICAgcHJlZmV0Y2g6IHtcbiAgICAgICAgdXJsOiBsaWJ1dGlscy5zcHJpbnNoYXJlVXJscy5ndWlkZXNfZXhwYW5kX293bmVyX3N1YmplY3QsXG4gICAgICAgIGNhY2hlOiB0cnVlLFxuICAgICAgICB0cmFuc2Zvcm06IGZ1bmN0aW9uKHJlc3BvbnNlKXtcbiAgICAgICAgICBsZXQgdHJhbnNmb3JtZWQgPSAkLm1hcChyZXNwb25zZSwgZnVuY3Rpb24gKG9wdGlvbikge1xuICAgICAgICAgICAgICBsZXQgc3ViamVjdHNBcnJheSA9ICAkLm1hcChvcHRpb24uc3ViamVjdHMsIGZ1bmN0aW9uKG4saSl7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBbIG4ubmFtZSBdO1xuICAgICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICAgICAgICBpZDogb3B0aW9uLmlkLFxuICAgICAgICAgICAgICAgICAgbmFtZTogb3B0aW9uLm5hbWUsXG4gICAgICAgICAgICAgICAgICBkZXNjcmlwdGlvbjogb3B0aW9uLmRlc2NyaXB0aW9uLFxuICAgICAgICAgICAgICAgICAgdXJsOiBvcHRpb24uZnJpZW5kbHlfdXJsIHx8IG9wdGlvbi51cmwsXG4gICAgICAgICAgICAgICAgICB0eXBlX2xhYmVsOiBvcHRpb24udHlwZV9sYWJlbCxcbiAgICAgICAgICAgICAgICAgIHR5cGVfbWFjaGluZTogb3B0aW9uLnR5cGVfbGFiZWwudG9Mb3dlckNhc2UoKS5yZXBsYWNlKFwiIFwiLFwiLVwiKS5jb25jYXQoXCItXCIsb3B0aW9uLnR5cGVfaWQpLFxuICAgICAgICAgICAgICAgICAgc3ViamVjdHM6IHN1YmplY3RzQXJyYXkuam9pbihcIiwgXCIpXG4gICAgICAgICAgICAgIH07XG4gICAgICAgICAgfSk7XG4gICAgICAgICAgcmV0dXJuIHRyYW5zZm9ybWVkO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfSk7XG5cbiAgICAvLyBQcm92aWRlIGEgZGVmYXVsdCB0byBkYXRhYmFzZSBxdWVyaWVzLiBPbiBmb2N1cyBvZiB0aGUgaW5wdXQsIHNlYXJjaCBmb3IgcHJlLWRlZmluZWQgYmVzdCBiZXRzLCBvdGhlcndpc2UsIGp1c3Qgc2VhcmNoLlxuICAgIGZ1bmN0aW9uIGNvdXJzZXNTb3VyY2UocSwgc3luYykge1xuICAgICAgYWxsTGliR3VpZGVzLnNlYXJjaChxICsgXCIgY291cnNlLWd1aWRlLTJcIiwgc3luYyk7XG4gICAgfVxuXG4gICAgLy8gU2V0dXAgdHlwYWhlYWQgZm9yIGNvdXJzZSBmaW5kZXJcbiAgICAkY291cnNlVHlwZUFoZWFkLnR5cGVhaGVhZCggYnVpbGR0eXBlYWhlYWRPcHRpb25zKDApLCAge1xuICAgICAgbmFtZTogXCJjb3Vyc2VzU291cmNlXCIsXG4gICAgICBzb3VyY2U6IGNvdXJzZXNTb3VyY2UsXG4gICAgICBkaXNwbGF5OiBcIm5hbWVcIixcbiAgICAgIGxpbWl0OiA1MDAsXG4gICAgICB0ZW1wbGF0ZXM6IHtcbiAgICAgICAgc3VnZ2VzdGlvbjogZnVuY3Rpb24oZGF0YSkge1xuICAgICAgICAgIHJldHVybiBcIjxkaXYgY2xhc3M9XFxcImxpc3QtZ3JvdXAtaXRlbSBkLWZsZXgganVzdGlmeS1jb250ZW50LWJldHdlZW4gYWxpZ24taXRlbXMtY2VudGVyXFxcIiByb2xlPVxcXCJsaW5rXFxcIj48ZGl2PlwiICtcbiAgICAgICAgICBkYXRhLm5hbWUgK1xuICAgICAgICAgIFwiPC9kaXY+PGkgY2xhc3M9XFxcImZhcyBmYS1leHRlcm5hbC1saW5rLWFsdFxcXCIgYXJpYS1oaWRkZW49XFxcInRydWVcXFwiIHRpdGxlPVxcXCJleHRlcm5hbCBsaW5rIHRvIFwiICsgZGF0YS5uYW1lICsgXCJcXFwiPjwvaT48L2Rpdj5cIjtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cbiAgICApLm9uKFwidHlwZWFoZWFkOnNlbGVjdGVkXCIsIGZ1bmN0aW9uKGV2ZW50LCBkYXR1bSkge1xuICAgICAgICBnYShcInNlbmRcIiwgXCJldmVudFwiLCBcImxpbmsgLSB0eXBlYWhlYWRcIiwgXCJjb3Vyc2VzXCIsIGRhdHVtLm5hbWUsIHsgaGl0Q2FsbGJhY2s6IGxpYnV0aWxzLmFjdFdpdGhUaW1lT3V0KGZ1bmN0aW9uKCl7XG4gICAgICAgICBsaWJ1dGlscy5nb1RvVXJsKGRhdHVtKTtcbiAgICAgICAgfSlcbiAgICAgfSk7XG4gICAgfSk7XG5cblxuICAgIC8vIERhdGEgc291cmNlIGZvciBzdWJqZWN0IGxpYnJhcmlhbnMgaW4gdHlwZWFoZWFkcy5cbiAgICBsZXQgbGlicmFyaWFucyA9IG5ldyBCbG9vZGhvdW5kKHtcbiAgICAgIGRhdHVtVG9rZW5pemVyOiBCbG9vZGhvdW5kLnRva2VuaXplcnMub2JqLndoaXRlc3BhY2UoXCJuYW1lXCIsIFwiam9iX3RpdGxlXCIsIFwibGlhaXNvbl9ub3Rlc1wiLCBcImFjYWRlbWljX3VuaXRzX3N0cmluZ1wiLCBcInN1YmplY3RzXCIpLFxuICAgICAgcXVlcnlUb2tlbml6ZXI6IEJsb29kaG91bmQudG9rZW5pemVycy53aGl0ZXNwYWNlLFxuICAgICAgcHJlZmV0Y2g6IGxpYnV0aWxzLnNpdGVEb21haW4gKyBcIi9hc3NldHMvZGF0YS9zdWJqZWN0LWxpYnJhcmlhbnMuanNvblwiXG4gICAgfSk7XG5cblxuICAgIC8vIFNldHVwIHR5cGFoZWFkIGZvciBob21lcGFnZSBtdWx0aS1zb3VyY2Ugc2VhcmNoIGJveC4gQ29tYmluZXMgc3ViamVjdCBsaWJyYXJpYW5zLCBhbmQgZ3VpZGVzIGludG8gc2luZ2xlIG91dHB1dC5cbiAgICAkc3R1ZGVudEhlbHBlci50eXBlYWhlYWQoIGJ1aWxkdHlwZWFoZWFkT3B0aW9ucygwKSwgIHtcbiAgICAgIG5hbWU6IFwibGlicmFyaWFuc1wiLFxuICAgICAgc291cmNlOiBsaWJyYXJpYW5zLFxuICAgICAgZGlzcGxheTogXCJuYW1lXCIsXG4gICAgICB0ZW1wbGF0ZXM6IHtcbiAgICAgICAgc3VnZ2VzdGlvbjogZnVuY3Rpb24oZGF0YSkge1xuICAgICAgICAgICAgcmV0dXJuIFwiPGRpdiBjbGFzcz1cXFwibGlzdC1ncm91cC1pdGVtIGxpc3QtZ3JvdXAtaXRlbS1hY3Rpb24gZC1mbGV4IGFsaWduLWl0ZW1zLWNlbnRlclxcXCI+PGRpdj5cIiArXG4gICAgICAgICAgICAgICAgICAgIFwiPGg1IGNsYXNzPVxcXCJoNlxcXCI+XCIgKyBkYXRhLm5hbWUgKyBcIiA8c21hbGw+ICZtZGFzaDsgXCIgKyBkYXRhLmpvYl90aXRsZSArIFwiPC9zbWFsbD48L2g1PlwiICtcbiAgICAgICAgICAgICAgICAgICAgXCI8c3Ryb25nPlBob25lOiA8L3N0cm9uZz5cIiArIGRhdGEucGhvbmUgKyBcIjxiciAvPlwiICtcbiAgICAgICAgICAgICAgICAgICAgXCI8c3Ryb25nPlNlcnZpbmc6IDwvc3Ryb25nPlwiICsgZGF0YS5hY2FkZW1pY191bml0c19zZXJ2ZWQgK1xuICAgICAgICAgICAgICAgICAgICBcIjwvZGl2PjxzcGFuIGNsYXNzPVxcXCJtbC1hdXRvIGJhZGdlIGJhZGdlLWRhcmtcXFwiPnN1YmplY3QgbGlicmFyaWFuPC9zcGFuPjwvZGl2PlwiICtcbiAgICAgICAgICAgICAgICAgICAgXCI8L2Rpdj5cIjtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH0sXG4gICAge1xuICAgICAgbmFtZTogXCJhbGxMaWJHdWlkZXNcIixcbiAgICAgIHNvdXJjZTogYWxsTGliR3VpZGVzLFxuICAgICAgZGlzcGxheTogXCJuYW1lXCIsXG4gICAgICBsaW1pdDogMjAsXG4gICAgICB0ZW1wbGF0ZXM6IHtcbiAgICAgICAgc3VnZ2VzdGlvbjogZnVuY3Rpb24oZGF0YSkge1xuXG4gICAgICAgICAgICBsZXQgZ3VpZGVUeXBlLCBiYWRnZVR5cGU7XG5cbiAgICAgICAgICAgIGlmIChkYXRhLnR5cGVfbGFiZWwgPT09IFwiQ291cnNlIEd1aWRlXCIpIHtcbiAgICAgICAgICAgICAgICBiYWRnZVR5cGUgPSBcImluZm9cIjtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgYmFkZ2VUeXBlID0gXCJzdWNjZXNzXCI7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHJldHVybiBcIjxkaXYgY2xhc3M9XFxcImxpc3QtZ3JvdXAtaXRlbSBsaXN0LWdyb3VwLWl0ZW0tYWN0aW9uIGQtZmxleCBhbGlnbi1pdGVtcy1jZW50ZXJcXFwiPjxkaXY+XCIgKyBkYXRhLm5hbWUgK1xuICAgICAgICAgICAgICAgICAgICBcIjwvZGl2PjxzcGFuIGNsYXNzPVxcXCJtbC1hdXRvIGJhZGdlIGJhZGdlLVwiICsgYmFkZ2VUeXBlICsgXCJcXFwiPlwiICsgZGF0YS50eXBlX2xhYmVsICsgXCI8L3NwYW4+PC9kaXY+XCI7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG4gICAgKS5vbihcInR5cGVhaGVhZDpzZWxlY3RlZFwiLCBmdW5jdGlvbihldmVudCwgZGF0dW0pIHtcbiAgICAgICAgZ2EoXCJzZW5kXCIsIFwiZXZlbnRcIiwgXCJsaW5rIC0gdHlwZWFoZWFkXCIsIFwic3R1ZGVudCBoZWxwZXIgLSBcIiArIGRhdHVtLnR5cGVfbGFiZWwsIGRhdHVtLm5hbWUsIHsgaGl0Q2FsbGJhY2s6IGxpYnV0aWxzLmFjdFdpdGhUaW1lT3V0KGZ1bmN0aW9uKCl7XG4gICAgICAgICBsaWJ1dGlscy5nb1RvVXJsKGRhdHVtKTtcbiAgICAgICAgfSlcbiAgICAgfSk7XG4gICAgfSk7XG4gIH1cbiAgLy8gRW5kIHN0dWRlbnQgaGVscGVyIHR5cGVhaGVhZCAoaGFzIG11bHRpcGxlIGJsb29kaG91bmQgc291cmNlcylcblxuXG5cblxuXG59KTsiXX0=
