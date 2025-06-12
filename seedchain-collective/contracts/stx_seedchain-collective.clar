;; stx-seedchain-collective.clar

;; This contract implements a collective investment scheme on the Stacks blockchain.
;; It allows users to pool funds and invest in projects, governed by a set of rules
;; and managed by a designated administrator.

(define-constant ERR-NOT-AUTHORIZED (err u100))
(define-constant ERR-ALREADY-INITIALIZED (err u101))
(define-constant ERR-INSUFFICIENT-FUNDS (err u102))
(define-constant ERR-INVALID-AMOUNT (err u103))
(define-constant ERR-PROJECT-NOT-FOUND (err u104))
(define-constant ERR-INVESTMENT-CLOSED (err u105))
(define-constant ERR-INVESTMENT-NOT_FOUND (err u106))
(define-constant ERR-TRANSFER-FAILED (err u107))

;; Data Maps and Variables

(define-data-var admin principal tx-sender)
(define-data-var investment-target uint u0)
(define-data-var investment-deadline uint u0)
(define-data-var investment-raised uint u0)
(define-data-var investment-active bool false)

(define-map investments
  { investor: principal, project-id: uint }
  { amount: uint, investment-date: uint }
)

(define-map projects
  { project-id: uint }
  { name: (string-ascii 256), description: (string-ascii 256), target-amount: uint, current-amount: uint, status: (string-ascii 20) }
)

;; Private Functions

(define-private (is-admin)
  (is-eq tx-sender (var-get admin))
)

;; Public Functions

(define-public (initialize (new-admin principal) (target uint) (deadline uint))
  (begin
    (asserts! (is-eq (var-get admin) tx-sender) ERR-ALREADY-INITIALIZED)
    (var-set admin new-admin)
    (var-set investment-target target)
    (var-set investment-deadline deadline)
    (var-set investment-active true)
    (ok true)
  )
)

(define-public (add-project (project-id uint) (name (string-ascii 256)) (description (string-ascii 256)) (target-amount uint))
  (begin
    (asserts! (is-admin) ERR-NOT-AUTHORIZED)
    (map-insert projects { project-id: project-id } { name: name, description: description, target-amount: target-amount, current-amount: u0, status: "funding" })
    (ok true)
  )
)

(define-public (invest (project-id uint) (amount uint))
  (begin
    (asserts! (var-get investment-active) ERR-INVESTMENT-CLOSED)
    (asserts! (> amount u0) ERR-INVALID-AMOUNT)
    
    (let ((project (unwrap! (map-get? projects { project-id: project-id }) ERR-PROJECT-NOT-FOUND)))
      (let ((current-amount (get current-amount project))
            (target-amount (get target-amount project)))
        (begin
          (asserts! (>= target-amount (+ current-amount amount)) ERR-INSUFFICIENT-FUNDS)
          
          ;; Transfer STX to contract
          (unwrap! (stx-transfer? amount tx-sender (as-contract tx-sender)) ERR-TRANSFER-FAILED)
          
          ;; Record investment
          (map-insert investments 
            { investor: tx-sender, project-id: project-id } 
            { amount: amount, investment-date: stacks-block-height })
          
          ;; Update project
          (map-set projects 
            { project-id: project-id } 
            { 
              name: (get name project), 
              description: (get description project), 
              target-amount: target-amount, 
              current-amount: (+ current-amount amount), 
              status: (get status project) 
            })
          
          ;; Update total raised
          (var-set investment-raised (+ (var-get investment-raised) amount))
          
          (ok true)
        )
      )
    )
  )
)

(define-public (close-investment-round)
  (begin
    (asserts! (is-admin) ERR-NOT-AUTHORIZED)
    (var-set investment-active false)
    (ok true)
  )
)

(define-read-only (get-investment (investor principal) (project-id uint))
  (map-get? investments { investor: investor, project-id: project-id })
)

(define-read-only (get-project (project-id uint))
  (map-get? projects { project-id: project-id })
)

(define-read-only (get-admin)
  (ok (var-get admin))
)

(define-read-only (get-investment-target)
  (ok (var-get investment-target))
)

(define-read-only (get-investment-deadline)
  (ok (var-get investment-deadline))
)

(define-read-only (get-investment-raised)
  (ok (var-get investment-raised))
)

(define-read-only (is-investment-active)
  (ok (var-get investment-active))
)
